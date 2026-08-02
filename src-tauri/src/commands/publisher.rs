use crate::db::DbState;
use chrono::Utc;
use regex::Regex;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub name: String,
    pub version: String,
    pub java_version: String,
    pub gradle_version: String,
    pub project_type: String,
    pub workspace_path: String,
    pub git_branch: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuildResult {
    pub id: String,
    pub status: String,
    pub duration_ms: u64,
    pub output: String,
    pub artifacts: Vec<ArtifactInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactInfo {
    pub id: String,
    pub filename: String,
    pub version: Option<String>,
    pub file_path: String,
    pub size_bytes: u64,
    pub status: String,
    pub build_time: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuildHistoryEntry {
    pub id: String,
    pub project_name: String,
    pub project_path: String,
    pub task: String,
    pub status: String,
    pub duration_ms: Option<i64>,
    pub version: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LastBuildInfo {
    pub last_build: Option<String>,
    pub last_publish: Option<String>,
    pub last_build_status: Option<String>,
    pub last_build_duration_ms: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleLine {
    pub level: String,
    pub message: String,
    pub timestamp: String,
}

pub struct BuildProcessState {
    pub cancel_flag: Arc<AtomicBool>,
    pub build_id: String,
}

pub struct BuildManager {
    pub active: Mutex<Option<BuildProcessState>>,
}

impl BuildManager {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(None),
        }
    }
}

fn read_gradle_property(content: &str, key: &str) -> Option<String> {
    let pattern = format!(r#"(?m)^\s*{key}\s*=\s*["']?([^"'\n\r]+)"?'?\s*$"#);
    Regex::new(&pattern)
        .ok()?
        .captures(content)
        .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
}

fn get_git_branch(path: &Path) -> Option<String> {
    let output = StdCommand::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() {
        None
    } else {
        Some(branch)
    }
}

fn detect_project_type(
    path: &Path,
    gradle_content: &str,
    settings_content: Option<&str>,
) -> String {
    let lower = gradle_content.to_lowercase();
    let settings_lower = settings_content.unwrap_or("").to_lowercase();
    let combined = format!("{lower} {settings_lower}");

    if combined.contains("net.neoforged") || combined.contains("neoforge") {
        return "NeoForge Mod".into();
    }
    if combined.contains("net.minecraftforge") || combined.contains("minecraftforge") {
        return "Forge Mod".into();
    }
    if combined.contains("fabric-loom") || combined.contains("net.fabricmc") {
        return "Fabric Mod".into();
    }
    if combined.contains("io.papermc.paperweight") || combined.contains("papermc") {
        return "Paper Plugin".into();
    }
    if combined.contains("com.velocitypowered") {
        return "Velocity Plugin".into();
    }
    if combined.contains("spigot") {
        return "Spigot Plugin".into();
    }
    if combined.contains("bukkit") {
        return "Bukkit Plugin".into();
    }

    if path.join("settings.gradle.kts").exists() || path.join("settings.gradle").exists() {
        if fs::read_dir(path)
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_dir())
                    .count()
                    > 1
            })
            .unwrap_or(false)
        {
            return "Gradle Multi-Module".into();
        }
    }

    "Standalone Java".into()
}

fn classify_log_line(line: &str) -> String {
    let lower = line.to_lowercase();
    if lower.contains("error") || lower.contains("exception") || lower.contains("failed") {
        "ERROR".into()
    } else if lower.contains("warn") {
        "WARN".into()
    } else if lower.contains("success") || lower.contains("successful") {
        "SUCCESS".into()
    } else {
        "INFO".into()
    }
}

fn gradle_file_path(project_path: &Path) -> Result<PathBuf, String> {
    let build_gradle_kts = project_path.join("build.gradle.kts");
    let build_gradle = project_path.join("build.gradle");
    if build_gradle_kts.exists() {
        Ok(build_gradle_kts)
    } else if build_gradle.exists() {
        Ok(build_gradle)
    } else {
        Err("No Gradle project found".into())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModuleInfo {
    pub name: String,
    pub gradle_path: String,
    pub module_dir: String,
}

/// Parses `include(...)` / `include ...` statements from settings.gradle(.kts).
/// Handles both Groovy (`include ':A', ':B'`) and Kotlin (`include(":A")`) syntax,
/// plus the common bare-name form without a leading colon.
#[tauri::command]
pub fn detect_modules(path: String) -> Result<Vec<ModuleInfo>, String> {
    let project_path = PathBuf::from(&path);
    let settings_kts = project_path.join("settings.gradle.kts");
    let settings_groovy = project_path.join("settings.gradle");
    let settings_file = if settings_kts.exists() {
        settings_kts
    } else {
        settings_groovy
    };

    let content = match fs::read_to_string(&settings_file) {
        Ok(c) => c,
        Err(_) => return Ok(Vec::new()),
    };

    let include_re =
        Regex::new(r"include(?:Project)?\s*\(?([^\n)]*)\)?").map_err(|e| e.to_string())?;
    let token_re = Regex::new(r#"["']([^"']+)["']"#).map_err(|e| e.to_string())?;

    let mut modules: Vec<ModuleInfo> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for include_match in include_re.captures_iter(&content) {
        let args = include_match.get(1).map(|m| m.as_str()).unwrap_or("");
        if args.trim().is_empty() {
            continue;
        }
        for token_match in token_re.captures_iter(args) {
            let raw = token_match.get(1).map(|m| m.as_str().trim()).unwrap_or("");
            if raw.is_empty() {
                continue;
            }
            let gradle_path = if raw.starts_with(':') {
                raw.to_string()
            } else {
                format!(":{raw}")
            };
            if !seen.insert(gradle_path.clone()) {
                continue;
            }
            let name = gradle_path
                .rsplit(':')
                .next()
                .unwrap_or(&gradle_path)
                .to_string();
            let relative = gradle_path.trim_start_matches(':').replace(':', "/");
            let module_dir = project_path.join(&relative).to_string_lossy().to_string();

            modules.push(ModuleInfo {
                name,
                gradle_path,
                module_dir,
            });
        }
    }

    Ok(modules)
}

#[tauri::command]
pub fn detect_project(path: String) -> Result<ProjectInfo, String> {
    let project_path = PathBuf::from(&path);
    if !project_path.exists() {
        return Err("Path does not exist".into());
    }

    let gradle_file = gradle_file_path(&project_path)?;
    let gradle_content = fs::read_to_string(&gradle_file).map_err(|e| e.to_string())?;
    let settings_path = project_path.join("settings.gradle.kts");
    let settings_content = if settings_path.exists() {
        fs::read_to_string(&settings_path).ok()
    } else {
        fs::read_to_string(project_path.join("settings.gradle")).ok()
    };

    let name = settings_content
        .as_ref()
        .and_then(|c| read_gradle_property(c, "rootProject.name"))
        .or_else(|| read_gradle_property(&gradle_content, "archivesBaseName"))
        .unwrap_or_else(|| {
            project_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string()
        });

    let version =
        read_gradle_property(&gradle_content, "version").unwrap_or_else(|| "1.0.0".into());

    let java_version = Regex::new(
        r#"(?i)JavaVersion\.VERSION_(\d+)|sourceCompatibility\s*=\s*['"]?(?:JavaVersion\.)?(\d+)"#,
    )
    .ok()
    .and_then(|re| {
        re.captures(&gradle_content).and_then(|c| {
            c.get(1)
                .or_else(|| c.get(2))
                .map(|m| m.as_str().to_string())
        })
    })
    .map(|v| format!("{v}"))
    .unwrap_or_else(|| "17".into());

    let gradle_version = project_path
        .join("gradle/wrapper/gradle-wrapper.properties")
        .exists()
        .then(|| {
            fs::read_to_string(project_path.join("gradle/wrapper/gradle-wrapper.properties"))
                .ok()
                .and_then(|c| {
                    Regex::new(r"distributionUrl=.*gradle-([\d.]+)-")
                        .ok()?
                        .captures(&c)?
                        .get(1)
                        .map(|m| m.as_str().to_string())
                })
        })
        .flatten()
        .unwrap_or_else(|| "8.x".into());

    let project_type =
        detect_project_type(&project_path, &gradle_content, settings_content.as_deref());
    let git_branch = get_git_branch(&project_path);

    Ok(ProjectInfo {
        name,
        version,
        java_version,
        gradle_version,
        project_type,
        workspace_path: path,
        git_branch,
    })
}

/// Translates a semantic task ("clean" | "build" | "build publish") plus an
/// optional set of selected module Gradle paths into the actual argument
/// list passed to gradlew. When modules are selected, tasks are scoped per
/// module (e.g. ":EclipseFramework:build") so only that module — and its
/// dependencies — gets built, instead of the whole multi-module workspace.
/// "publish" is intentionally NOT translated into a literal Gradle task:
/// it's handled at the application level (copy to output dir + Discord),
/// since most workspaces don't have the maven-publish plugin configured.
fn build_gradle_args(task: &str, modules: &Option<Vec<String>>) -> Vec<String> {
    let base_tasks: Vec<&str> = match task {
        "clean" => vec!["clean"],
        "build" | "build publish" => vec!["build"],
        other => other.split_whitespace().collect(),
    };

    let mut args = Vec::new();
    match modules {
        Some(mods) if !mods.is_empty() => {
            for module in mods {
                for t in &base_tasks {
                    args.push(format!("{module}:{t}"));
                }
            }
        }
        _ => {
            for t in &base_tasks {
                args.push((*t).to_string());
            }
        }
    }
    args.push("--console=plain".to_string());
    args
}

#[tauri::command]
pub async fn run_gradle_task(
    app: AppHandle,
    state: State<'_, DbState>,
    build_manager: State<'_, BuildManager>,
    user_id: String,
    project_path: String,
    task: String,
    output_dir: Option<String>,
    version: Option<String>,
    modules: Option<Vec<String>>,
) -> Result<BuildResult, String> {
    if build_manager
        .active
        .lock()
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Err("A build is already in progress".into());
    }

    if let Some(mods) = &modules {
        if mods.is_empty() {
            return Err("No modules selected".into());
        }
    }

    let build_id = Uuid::new_v4().to_string();
    let start = std::time::Instant::now();
    let project = PathBuf::from(&project_path);
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let cancel_clone = cancel_flag.clone();
    let build_id_clone = build_id.clone();

    {
        let mut active = build_manager.active.lock().map_err(|e| e.to_string())?;
        *active = Some(BuildProcessState {
            cancel_flag: cancel_flag.clone(),
            build_id: build_id.clone(),
        });
    }

    let gradlew = if cfg!(windows) {
        project.join("gradlew.bat")
    } else {
        project.join("gradlew")
    };

    let mut cmd = if gradlew.exists() {
        let mut c = TokioCommand::new(&gradlew);
        c.current_dir(&project);
        c
    } else {
        let mut c = TokioCommand::new("gradle");
        c.current_dir(&project);
        c
    };

    let gradle_args = build_gradle_args(&task, &modules);

    cmd.args(&gradle_args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let _ = app.emit(
        "build-started",
        &serde_json::json!({ "buildId": build_id, "task": task, "args": gradle_args }),
    );

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run Gradle: {e}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_out = app.clone();
    let app_err = app.clone();
    let bid_out = build_id.clone();
    let bid_err = build_id.clone();

    let stdout_handle = tokio::spawn(async move {
        let mut lines = Vec::new();
        if let Some(out) = stdout {
            let reader = BufReader::new(out);
            let mut stream = reader.lines();
            while let Ok(Some(line)) = stream.next_line().await {
                if cancel_clone.load(Ordering::Relaxed) {
                    break;
                }
                let level = classify_log_line(&line);
                let timestamp = Utc::now().format("%H:%M:%S").to_string();
                let _ = app_out.emit(
                    "build-output",
                    &ConsoleLine {
                        level: level.clone(),
                        message: line.clone(),
                        timestamp,
                    },
                );
                lines.push(line);
            }
        }
        (bid_out, lines)
    });

    let stderr_handle = tokio::spawn(async move {
        let mut lines = Vec::new();
        if let Some(err) = stderr {
            let reader = BufReader::new(err);
            let mut stream = reader.lines();
            while let Ok(Some(line)) = stream.next_line().await {
                let level = classify_log_line(&line);
                let timestamp = Utc::now().format("%H:%M:%S").to_string();
                let _ = app_err.emit(
                    "build-output",
                    &ConsoleLine {
                        level,
                        message: line.clone(),
                        timestamp,
                    },
                );
                lines.push(line);
            }
        }
        (bid_err, lines)
    });

    let status = if cancel_flag.load(Ordering::Relaxed) {
        let _ = child.kill().await;
        child.wait().await.ok();
        None
    } else {
        child.wait().await.ok()
    };

    let (_, stdout_lines) = stdout_handle.await.map_err(|e| e.to_string())?;
    let (_, stderr_lines) = stderr_handle.await.map_err(|e| e.to_string())?;

    {
        let mut active = build_manager.active.lock().map_err(|e| e.to_string())?;
        *active = None;
    }

    let duration_ms = start.elapsed().as_millis() as u64;
    let combined = format!("{}\n{}", stdout_lines.join("\n"), stderr_lines.join("\n"));

    let build_status = if cancel_flag.load(Ordering::Relaxed) {
        "BUILD CANCELLED"
    } else if status.as_ref().map(|s| s.success()).unwrap_or(false) {
        "BUILD SUCCESSFUL"
    } else {
        "BUILD FAILED"
    };

    let project_info = detect_project(project_path.clone()).unwrap_or(ProjectInfo {
        name: "Unknown".into(),
        version: version.clone().unwrap_or_else(|| "1.0.0".into()),
        java_version: "17".into(),
        gradle_version: "8.x".into(),
        project_type: "Unknown".into(),
        workspace_path: project_path.clone(),
        git_branch: None,
    });

    let now = Utc::now().to_rfc3339();
    let project_version = version.or(Some(project_info.version.clone()));
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO build_history (id, user_id, project_path, project_name, task, status, duration_ms, output, version, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![build_id, user_id, project_path, project_info.name, task, build_status, duration_ms as i64, combined, project_version, now],
        ).map_err(|e| e.to_string())?;
    }

    let mut artifacts = Vec::new();
    if build_status == "BUILD SUCCESSFUL" {
        artifacts = collect_artifacts(
            &project,
            &user_id,
            &project_path,
            &state,
            project_version.as_deref(),
            &modules,
        )?;
        if let Some(dir) = output_dir {
            copy_artifacts_to_output(
                &artifacts,
                &dir,
                &project_info.name,
                project_version.as_deref(),
            )?;
        }
    }

    let result = BuildResult {
        id: build_id_clone,
        status: build_status.into(),
        duration_ms,
        output: combined,
        artifacts,
    };

    let _ = app.emit("build-finished", &result);
    Ok(result)
}

#[tauri::command]
pub fn cancel_build(build_manager: State<'_, BuildManager>) -> Result<(), String> {
    let active = build_manager.active.lock().map_err(|e| e.to_string())?;
    if let Some(state) = active.as_ref() {
        state.cancel_flag.store(true, Ordering::Relaxed);
        Ok(())
    } else {
        Err("No active build to cancel".into())
    }
}

fn collect_artifacts(
    project: &Path,
    user_id: &str,
    project_path: &str,
    state: &DbState,
    version: Option<&str>,
    modules: &Option<Vec<String>>,
) -> Result<Vec<ArtifactInfo>, String> {
    let mut search_dirs: Vec<PathBuf> = Vec::new();
    match modules {
        Some(mods) if !mods.is_empty() => {
            for module in mods {
                let relative = module.trim_start_matches(':').replace(':', "/");
                search_dirs.push(project.join(relative).join("build").join("libs"));
            }
        }
        _ => {
            search_dirs.push(project.join("build").join("libs"));
        }
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let mut artifacts = Vec::new();

    for build_dir in search_dirs {
        if !build_dir.exists() {
            continue;
        }
        for entry in fs::read_dir(&build_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jar") {
                continue;
            }
            let filename = path.file_name().unwrap().to_string_lossy().to_string();
            if filename.contains("-sources") || filename.contains("-javadoc") {
                continue;
            }
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let id = Uuid::new_v4().to_string();
            let file_path = path.to_string_lossy().to_string();

            conn.execute(
                "INSERT INTO artifacts (id, user_id, project_path, filename, file_path, size_bytes, status, build_time, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![id, user_id, project_path, filename, file_path, size as i64, "ready", now, version],
            ).ok();

            artifacts.push(ArtifactInfo {
                id,
                filename,
                version: version.map(|v| v.to_string()),
                file_path,
                size_bytes: size,
                status: "ready".into(),
                build_time: now.clone(),
            });
        }
    }
    Ok(artifacts)
}

fn copy_artifacts_to_output(
    artifacts: &[ArtifactInfo],
    output_dir: &str,
    project_name: &str,
    version: Option<&str>,
) -> Result<(), String> {
    let version_dir = version.unwrap_or("latest");
    let dest_dir = PathBuf::from(output_dir)
        .join(project_name)
        .join(version_dir);
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    for artifact in artifacts {
        let dest = dest_dir.join(&artifact.filename);
        fs::copy(&artifact.file_path, &dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_build_history(
    state: State<'_, DbState>,
    user_id: String,
    limit: i64,
    query: Option<String>,
    status_filter: Option<String>,
) -> Result<Vec<BuildHistoryEntry>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let q = query.unwrap_or_default().trim().to_lowercase();
    let status_pattern = match status_filter.as_deref().unwrap_or("all") {
        "all" | "" => String::new(),
        "success" => "SUCCESS".to_string(),
        "failed" => "FAILED".to_string(),
        "cancelled" => "CANCELLED".to_string(),
        other => other.to_uppercase(),
    };

    let mut stmt = conn
        .prepare(
            "SELECT id, project_name, project_path, task, status, duration_ms, version, created_at
             FROM build_history
             WHERE user_id = ?1
               AND (?2 = '' OR project_name LIKE '%' || ?2 || '%' OR project_path LIKE '%' || ?2 || '%'
                    OR task LIKE '%' || ?2 || '%' OR version LIKE '%' || ?2 || '%')
               AND (?3 = '' OR status LIKE '%' || ?3 || '%')
             ORDER BY created_at DESC
             LIMIT ?4",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![user_id, q, status_pattern, limit], |r| {
            Ok(BuildHistoryEntry {
                id: r.get(0)?,
                project_name: r.get(1)?,
                project_path: r.get(2)?,
                task: r.get(3)?,
                status: r.get(4)?,
                duration_ms: r.get(5)?,
                version: r.get(6)?,
                created_at: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn get_last_build_info(
    state: State<'_, DbState>,
    user_id: String,
    project_path: String,
) -> Result<LastBuildInfo, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let last_build: Option<(String, String, Option<i64>)> = conn
        .query_row(
            "SELECT created_at, status, duration_ms FROM build_history WHERE user_id = ?1 AND project_path = ?2 ORDER BY created_at DESC LIMIT 1",
            params![user_id, project_path],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();

    let last_publish: Option<String> = conn
        .query_row(
            "SELECT created_at FROM build_history WHERE user_id = ?1 AND project_path = ?2 AND task LIKE '%publish%' AND status LIKE '%SUCCESS%' ORDER BY created_at DESC LIMIT 1",
            params![user_id, project_path],
            |r| r.get(0),
        )
        .ok();

    Ok(LastBuildInfo {
        last_build: last_build.as_ref().map(|(d, _, _)| d.clone()),
        last_publish,
        last_build_status: last_build.as_ref().map(|(_, s, _)| s.clone()),
        last_build_duration_ms: last_build.and_then(|(_, _, d)| d),
    })
}

#[tauri::command]
pub fn get_artifacts(
    state: State<'_, DbState>,
    user_id: String,
    project_path: Option<String>,
) -> Result<Vec<ArtifactInfo>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let rows = if let Some(path) = project_path {
        let mut stmt = conn
            .prepare("SELECT id, filename, version, file_path, size_bytes, status, build_time FROM artifacts WHERE user_id = ?1 AND project_path = ?2 ORDER BY build_time DESC")
            .map_err(|e| e.to_string())?;
        let result = stmt
            .query_map(params![user_id, path], map_artifact)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        result
    } else {
        let mut stmt = conn
            .prepare("SELECT id, filename, version, file_path, size_bytes, status, build_time FROM artifacts WHERE user_id = ?1 ORDER BY build_time DESC LIMIT 50")
            .map_err(|e| e.to_string())?;
        let result = stmt
            .query_map(params![user_id], map_artifact)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        result
    };
    Ok(rows)
}

fn map_artifact(r: &rusqlite::Row) -> rusqlite::Result<ArtifactInfo> {
    Ok(ArtifactInfo {
        id: r.get(0)?,
        filename: r.get(1)?,
        version: r.get(2)?,
        file_path: r.get(3)?,
        size_bytes: r.get::<_, i64>(4)? as u64,
        status: r.get(5)?,
        build_time: r.get(6)?,
    })
}

#[tauri::command]
pub fn delete_artifact(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let path: String = conn
        .query_row(
            "SELECT file_path FROM artifacts WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {e}"))?;
    conn.execute("DELETE FROM artifacts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn rename_artifact(
    state: State<'_, DbState>,
    id: String,
    new_filename: String,
) -> Result<ArtifactInfo, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let old_path: String = conn
        .query_row(
            "SELECT file_path FROM artifacts WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let old = PathBuf::from(&old_path);
    let new_path = old.parent().unwrap().join(&new_filename);
    fs::rename(&old, &new_path).map_err(|e| e.to_string())?;
    let new_path_str = new_path.to_string_lossy().to_string();
    conn.execute(
        "UPDATE artifacts SET filename = ?1, file_path = ?2 WHERE id = ?3",
        params![new_filename, new_path_str, id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, filename, version, file_path, size_bytes, status, build_time FROM artifacts WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(params![id], map_artifact)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_recent_workspace(
    state: State<'_, DbState>,
    user_id: String,
    path: String,
    name: String,
    project_type: String,
    version: Option<String>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "DELETE FROM recent_workspaces WHERE user_id = ?1 AND path = ?2",
        params![user_id, path],
    )
    .ok();
    conn.execute(
        "INSERT INTO recent_workspaces (user_id, path, name, project_type, version, opened_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![user_id, path, name, project_type, version, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspace {
    pub path: String,
    pub name: String,
    pub project_type: String,
    pub version: Option<String>,
    pub opened_at: String,
}

#[tauri::command]
pub fn get_recent_workspaces(
    state: State<'_, DbState>,
    user_id: String,
) -> Result<Vec<RecentWorkspace>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT path, name, project_type, version, opened_at FROM recent_workspaces WHERE user_id = ?1 ORDER BY opened_at DESC LIMIT 10")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user_id], |r| {
            Ok(RecentWorkspace {
                path: r.get(0)?,
                name: r.get(1)?,
                project_type: r.get(2)?,
                version: r.get(3)?,
                opened_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordArtifactRef {
    pub filename: String,
    pub file_path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordWebhookPayload {
    pub webhook_url: String,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub project: String,
    pub version: String,
    pub developer: String,
    pub duration: String,
    pub status: String,
    pub artifacts: Vec<DiscordArtifactRef>,
}

// Discord's default per-message attachment budget for webhooks without server boosts.
const DISCORD_MAX_ATTACHMENT_BYTES: u64 = 25 * 1024 * 1024;

#[tauri::command]
pub async fn send_discord_webhook(payload: DiscordWebhookPayload) -> Result<(), String> {
    let total_size: u64 = payload.artifacts.iter().map(|a| a.size_bytes).sum();
    let can_attach = !payload.artifacts.is_empty() && total_size <= DISCORD_MAX_ATTACHMENT_BYTES;

    let artifact_list = if payload.artifacts.is_empty() {
        "No artifacts produced".to_string()
    } else {
        payload
            .artifacts
            .iter()
            .map(|a| {
                if can_attach {
                    format!("{} (attached)", a.filename)
                } else {
                    format!(
                        "{} ({:.1} MB)",
                        a.filename,
                        a.size_bytes as f64 / (1024.0 * 1024.0)
                    )
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    let embed = serde_json::json!({
        "title": "Build Published",
        "color": if payload.status.contains("SUCCESS") { 5763719 } else { 15548997 },
        "fields": [
            { "name": "Project", "value": payload.project, "inline": true },
            { "name": "Version", "value": payload.version, "inline": true },
            { "name": "Developer", "value": payload.developer, "inline": true },
            { "name": "Duration", "value": payload.duration, "inline": true },
            { "name": "Status", "value": payload.status, "inline": true },
            { "name": "Artifacts", "value": artifact_list, "inline": false },
        ],
        "timestamp": Utc::now().to_rfc3339()
    });

    let body = serde_json::json!({
        "username": payload.username.unwrap_or_else(|| "Yuzei Labs".into()),
        "avatar_url": payload.avatar_url,
        "embeds": [embed]
    });

    let client = reqwest::Client::new();

    let response = if can_attach {
        let mut form = reqwest::multipart::Form::new().text("payload_json", body.to_string());

        for (i, artifact) in payload.artifacts.iter().enumerate() {
            let bytes = fs::read(&artifact.file_path)
                .map_err(|e| format!("Failed to read artifact {}: {e}", artifact.filename))?;
            let part = reqwest::multipart::Part::bytes(bytes)
                .file_name(artifact.filename.clone())
                .mime_str("application/java-archive")
                .map_err(|e| e.to_string())?;
            form = form.part(format!("files[{i}]"), part);
        }

        client
            .post(&payload.webhook_url)
            .multipart(form)
            .send()
            .await
    } else {
        if !payload.artifacts.is_empty() {
            log::warn!(
                "Skipping Discord attachment: total artifact size {total_size} bytes exceeds the {DISCORD_MAX_ATTACHMENT_BYTES} byte limit; sending file names only."
            );
        }
        client.post(&payload.webhook_url).json(&body).send().await
    };

    response
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn find_jar_files(path: String) -> Result<Vec<String>, String> {
    let root = PathBuf::from(&path);
    let mut jars = Vec::new();
    for entry in WalkDir::new(&root).max_depth(5) {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().extension().and_then(|e| e.to_str()) == Some("jar") {
            jars.push(entry.path().to_string_lossy().to_string());
        }
    }
    jars.sort();
    Ok(jars)
}

/// Registers a jar discovered via find_jar_files as a real tracked artifact,
/// so "Scan for JARs" in Generated Files can actually surface jars built
/// outside of a normal Yuzei Labs build (e.g. from before the app was
/// tracking them, or built by a bare `gradlew` invocation) instead of just
/// listing paths nobody can do anything with.
#[tauri::command]
pub fn import_jar_as_artifact(
    state: State<'_, DbState>,
    user_id: String,
    project_path: String,
    file_path: String,
) -> Result<ArtifactInfo, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("File no longer exists".into());
    }
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or("Invalid file path")?;
    let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let already_tracked: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM artifacts WHERE user_id = ?1 AND file_path = ?2)",
            params![user_id, file_path],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if already_tracked {
        return Err("Already tracked as an artifact".into());
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO artifacts (id, user_id, project_path, filename, file_path, size_bytes, status, build_time, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, user_id, project_path, filename, file_path, size as i64, "imported", now, Option::<String>::None],
    )
    .map_err(|e| e.to_string())?;

    Ok(ArtifactInfo {
        id,
        filename,
        version: None,
        file_path,
        size_bytes: size,
        status: "imported".into(),
        build_time: now,
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DetectedIde {
    pub id: String,
    pub name: String,
    pub found: bool,
    pub path: Option<String>,
}

/// Returns the first path in `candidates` that exists on disk, if any.
fn first_existing(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|p| p.exists()).cloned()
}

/// Resolves a launchable executable path for an IDE, checking common install
/// locations first, then falling back to a PATH lookup via `where`/`which`.
fn resolve_ide_executable(ide: &str) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if cfg!(windows) {
        let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let program_files =
            std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
        let program_files_x86 =
            std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".into());

        match ide {
            "intellij" => {
                candidates
                    .push(PathBuf::from(&local_appdata).join("Programs\\IDEA U\\bin\\idea64.exe"));
                candidates
                    .push(PathBuf::from(&local_appdata).join("Programs\\IDEA C\\bin\\idea64.exe"));
                // Fall back to scanning the JetBrains install root for any IDEA version folder.
                if let Ok(entries) = fs::read_dir(PathBuf::from(&program_files).join("JetBrains")) {
                    for entry in entries.flatten() {
                        candidates.push(entry.path().join("bin\\idea64.exe"));
                    }
                }
            }
            "eclipse" => {
                candidates.push(PathBuf::from(&program_files).join("Eclipse\\eclipse.exe"));
                candidates.push(PathBuf::from(&local_appdata).join("Eclipse\\eclipse.exe"));
                candidates.push(PathBuf::from("C:\\eclipse\\eclipse.exe"));
            }
            "vscode" => {
                candidates.push(
                    PathBuf::from(&local_appdata).join("Programs\\Microsoft VS Code\\Code.exe"),
                );
                candidates.push(PathBuf::from(&program_files).join("Microsoft VS Code\\Code.exe"));
                candidates
                    .push(PathBuf::from(&program_files_x86).join("Microsoft VS Code\\Code.exe"));
            }
            _ => {}
        }
    } else if cfg!(target_os = "macos") {
        match ide {
            "intellij" => candidates.push(PathBuf::from("/Applications/IntelliJ IDEA.app")),
            "eclipse" => candidates.push(PathBuf::from("/Applications/Eclipse.app")),
            "vscode" => candidates.push(PathBuf::from("/Applications/Visual Studio Code.app")),
            _ => {}
        }
    }

    if let Some(found) = first_existing(&candidates) {
        return Some(found);
    }

    // Fall back to a PATH lookup for the CLI launcher.
    let lookup_name = match ide {
        "intellij" => "idea64",
        "eclipse" => "eclipse",
        "vscode" => "code",
        _ => return None,
    };
    let finder = if cfg!(windows) { "where" } else { "which" };
    StdCommand::new(finder)
        .arg(lookup_name)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().next().map(|l| PathBuf::from(l.trim())))
}

#[tauri::command]
pub fn detect_installed_ides() -> Result<Vec<DetectedIde>, String> {
    let ides = [
        ("intellij", "IntelliJ IDEA"),
        ("vscode", "Visual Studio Code"),
        ("eclipse", "Eclipse IDE"),
    ];

    Ok(ides
        .iter()
        .map(|(id, name)| {
            let resolved = resolve_ide_executable(id);
            DetectedIde {
                id: id.to_string(),
                name: name.to_string(),
                found: resolved.is_some(),
                path: resolved.map(|p| p.to_string_lossy().to_string()),
            }
        })
        .collect())
}

#[tauri::command]
pub fn open_in_ide(project_path: String, ide: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path);
    if !path.exists() {
        return Err("Project path does not exist".into());
    }

    let resolved = resolve_ide_executable(&ide);

    match ide.as_str() {
        "intellij" => {
            if let Some(exe) = resolved {
                StdCommand::new(exe)
                    .arg(&project_path)
                    .spawn()
                    .map_err(|e| format!("Failed to launch IntelliJ IDEA: {e}"))?;
            } else if cfg!(windows) {
                StdCommand::new("cmd")
                    .args(["/C", "start", "", "idea64.exe", &project_path])
                    .spawn()
                    .map_err(|_| {
                        "IntelliJ IDEA was not found. Install it or add it to your PATH."
                            .to_string()
                    })?;
            } else {
                StdCommand::new("idea")
                    .arg(&project_path)
                    .spawn()
                    .map_err(|_| {
                        "IntelliJ IDEA was not found. Install it or add it to your PATH."
                            .to_string()
                    })?;
            }
        }
        "eclipse" => {
            if let Some(exe) = resolved {
                StdCommand::new(exe)
                    .args(["-data", &project_path])
                    .spawn()
                    .map_err(|e| format!("Failed to launch Eclipse IDE: {e}"))?;
            } else if cfg!(windows) {
                StdCommand::new("cmd")
                    .args(["/C", "start", "", "eclipse.exe", "-data", &project_path])
                    .spawn()
                    .map_err(|_| {
                        "Eclipse IDE was not found. Install it or add it to your PATH.".to_string()
                    })?;
            } else {
                StdCommand::new("eclipse")
                    .arg(&project_path)
                    .spawn()
                    .map_err(|_| {
                        "Eclipse IDE was not found. Install it or add it to your PATH.".to_string()
                    })?;
            }
        }
        "vscode" => {
            let launch = resolved.unwrap_or_else(|| PathBuf::from("code"));
            StdCommand::new(launch)
                .arg(&project_path)
                .spawn()
                .map_err(|_| {
                    "Visual Studio Code was not found. Install it or add it to your PATH."
                        .to_string()
                })?;
        }
        _ => return Err(format!("Unknown IDE: {ide}")),
    }
    Ok(())
}

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if cfg!(windows) {
        StdCommand::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    } else if cfg!(target_os = "macos") {
        StdCommand::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        if p.is_file() {
            StdCommand::new("xdg-open")
                .arg(p.parent().unwrap())
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            StdCommand::new("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let folder = if p.is_file() {
        p.parent().unwrap().to_string_lossy().to_string()
    } else {
        path
    };

    if cfg!(windows) {
        StdCommand::new("explorer")
            .arg(&folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    } else if cfg!(target_os = "macos") {
        StdCommand::new("open")
            .arg(&folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        StdCommand::new("xdg-open")
            .arg(&folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn update_project_version(
    project_path: String,
    version: String,
    developer: Option<String>,
    build_number: Option<String>,
    state: State<'_, DbState>,
) -> Result<ProjectInfo, String> {
    let path = PathBuf::from(&project_path);
    let gradle_file = gradle_file_path(&path)?;
    let content = fs::read_to_string(&gradle_file).map_err(|e| e.to_string())?;

    let version_re =
        Regex::new(r#"(?m)(^\s*version\s*=\s*['"])([^'"]+)(['"])"#).map_err(|e| e.to_string())?;
    let new_content = if version_re.is_match(&content) {
        version_re
            .replace(&content, format!("${{1}}{version}${{3}}"))
            .to_string()
    } else {
        format!("{content}\nversion = \"{version}\"\n")
    };

    fs::write(&gradle_file, &new_content).map_err(|e| e.to_string())?;

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO version_history (project_path, version, developer, build_number, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![project_path, version, developer, build_number, now],
    )
    .ok();

    detect_project(project_path)
}

#[tauri::command]
pub fn get_version_history(
    state: State<'_, DbState>,
    project_path: String,
) -> Result<Vec<HashMap<String, String>>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT version, developer, build_number, created_at FROM version_history WHERE project_path = ?1 ORDER BY created_at DESC LIMIT 20")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_path], |r| {
            let mut map = HashMap::new();
            map.insert("version".into(), r.get::<_, String>(0)?);
            map.insert(
                "developer".into(),
                r.get::<_, Option<String>>(1)?.unwrap_or_default(),
            );
            map.insert(
                "buildNumber".into(),
                r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            );
            map.insert("createdAt".into(), r.get::<_, String>(3)?);
            Ok(map)
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_release_notes(
    state: State<'_, DbState>,
    project_path: String,
    content: String,
    version: Option<String>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO release_notes (project_path, content, version, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(project_path) DO UPDATE SET content = ?2, version = ?3, updated_at = ?4",
        params![project_path, content, version, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_release_notes(
    state: State<'_, DbState>,
    project_path: String,
) -> Result<Option<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    match conn.query_row(
        "SELECT content FROM release_notes WHERE project_path = ?1",
        params![project_path],
        |r| r.get(0),
    ) {
        Ok(content) => Ok(Some(content)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
