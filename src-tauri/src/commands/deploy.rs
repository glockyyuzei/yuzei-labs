use crate::db::DbState;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentProfile {
    pub id: String,
    pub name: String,
    pub project_path: Option<String>,
    pub target_type: String,
    pub config: serde_json::Value,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub server_folder: String,
    pub mods_folder: Option<String>,
    pub plugins_folder: Option<String>,
    pub java_version: Option<String>,
    pub startup_script: Option<String>,
    pub shutdown_script: Option<String>,
    pub working_directory: Option<String>,
    pub config: serde_json::Value,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub id: String,
    pub name: String,
    pub status: String,
    pub online_players: u32,
    pub max_players: u32,
    pub uptime_secs: u64,
    pub cpu_usage: f32,
    pub ram_usage_mb: f32,
    pub ram_total_mb: f32,
    pub tps: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeployResult {
    pub success: bool,
    pub message: String,
    pub targets: Vec<String>,
}

pub struct ProcessHandle {
    pub pid: u32,
    pub stdin: Option<std::process::ChildStdin>,
}

pub struct ServerProcesses {
    pub processes: Mutex<std::collections::HashMap<String, ProcessHandle>>,
    /// Last (timestamp, cumulative CPU-seconds) sample per server, used to
    /// turn PowerShell's cumulative CPU time into an instantaneous percent.
    pub cpu_samples: Mutex<std::collections::HashMap<String, (std::time::Instant, f64)>>,
}

impl ServerProcesses {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(std::collections::HashMap::new()),
            cpu_samples: Mutex::new(std::collections::HashMap::new()),
        }
    }
}

#[tauri::command]
pub fn save_deployment_profile(
    state: State<'_, DbState>,
    user_id: String,
    profile: DeploymentProfile,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO deployment_profiles (id, user_id, name, project_path, target_type, config, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET name = ?3, project_path = ?4, target_type = ?5, config = ?6",
        params![
            profile.id,
            user_id,
            profile.name,
            profile.project_path,
            profile.target_type,
            profile.config.to_string(),
            profile.created_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_deployment_profiles(
    state: State<'_, DbState>,
    user_id: String,
) -> Result<Vec<DeploymentProfile>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, project_path, target_type, config, created_at FROM deployment_profiles WHERE user_id = ?1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user_id], |r| {
            let config_str: String = r.get(4)?;
            Ok(DeploymentProfile {
                id: r.get(0)?,
                name: r.get(1)?,
                project_path: r.get(2)?,
                target_type: r.get(3)?,
                config: serde_json::from_str(&config_str).unwrap_or(serde_json::json!({})),
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_deployment_profile(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM deployment_profiles WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_server(
    state: State<'_, DbState>,
    user_id: String,
    server: ServerConfig,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO servers (id, user_id, name, server_folder, mods_folder, plugins_folder, java_version, startup_script, shutdown_script, working_directory, config, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(id) DO UPDATE SET name = ?3, server_folder = ?4, mods_folder = ?5, plugins_folder = ?6, java_version = ?7, startup_script = ?8, shutdown_script = ?9, working_directory = ?10, config = ?11",
        params![
            server.id,
            user_id,
            server.name,
            server.server_folder,
            server.mods_folder,
            server.plugins_folder,
            server.java_version,
            server.startup_script,
            server.shutdown_script,
            server.working_directory,
            server.config.to_string(),
            server.created_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_servers(
    state: State<'_, DbState>,
    user_id: String,
) -> Result<Vec<ServerConfig>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, server_folder, mods_folder, plugins_folder, java_version, startup_script, shutdown_script, working_directory, config, created_at FROM servers WHERE user_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user_id], |r| {
            let config_str: String = r.get(9)?;
            Ok(ServerConfig {
                id: r.get(0)?,
                name: r.get(1)?,
                server_folder: r.get(2)?,
                mods_folder: r.get(3)?,
                plugins_folder: r.get(4)?,
                java_version: r.get(5)?,
                startup_script: r.get(6)?,
                shutdown_script: r.get(7)?,
                working_directory: r.get(8)?,
                config: serde_json::from_str(&config_str).unwrap_or(serde_json::json!({})),
                created_at: r.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_server(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM servers WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir = PathBuf::from(&path);
    if !dir.exists() {
        return Err("Directory does not exist".into());
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| {
                chrono::DateTime::<Utc>::from(t)
                    .format("%Y-%m-%d %H:%M")
                    .to_string()
                    .into()
            })
            .unwrap_or_default();
        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size: meta.len(),
            modified,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_file(src: String, dest: String) -> Result<(), String> {
    let dest_path = PathBuf::from(&dest);
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeployHistoryEntry {
    pub id: String,
    pub server_name: String,
    pub artifact_name: String,
    pub target_folder: String,
    pub status: String,
    pub message: Option<String>,
    pub created_at: String,
}

pub fn record_deploy_history(
    conn: &rusqlite::Connection,
    user_id: &str,
    server_name: &str,
    artifact_name: &str,
    target_folder: &str,
    status: &str,
    message: &str,
) {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let _ = conn.execute(
        "INSERT INTO deploy_history (id, user_id, server_name, artifact_name, target_folder, status, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, user_id, server_name, artifact_name, target_folder, status, message, now],
    );
}

#[tauri::command]
pub fn get_deploy_history(
    state: State<'_, DbState>,
    user_id: String,
) -> Result<Vec<DeployHistoryEntry>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, server_name, artifact_name, target_folder, status, message, created_at
             FROM deploy_history WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user_id], |r| {
            Ok(DeployHistoryEntry {
                id: r.get(0)?,
                server_name: r.get(1)?,
                artifact_name: r.get(2)?,
                target_folder: r.get(3)?,
                status: r.get(4)?,
                message: r.get(5)?,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub async fn deploy_artifact(
    app: AppHandle,
    state: State<'_, DbState>,
    user_id: String,
    artifact_path: String,
    target_folder: String,
    auto_backup: bool,
    auto_restart: bool,
    server_id: Option<String>,
    server_name: Option<String>,
    processes: State<'_, Arc<ServerProcesses>>,
) -> Result<DeployResult, String> {
    let _ = app.emit("deploy-started", &target_folder);
    let target = PathBuf::from(&target_folder);
    fs::create_dir_all(&target).map_err(|e| e.to_string())?;

    let artifact_name = PathBuf::from(&artifact_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let dest = target.join(&artifact_name);

    if auto_backup && dest.exists() {
        let backup_dir = target.join(".yuzei-backups");
        fs::create_dir_all(&backup_dir).ok();
        let backup_name = format!(
            "{}.backup.{}",
            artifact_name,
            Utc::now().format("%Y%m%d_%H%M%S")
        );
        fs::copy(&dest, backup_dir.join(backup_name)).ok();
    }

    // NOTE: this used to also delete every *other* .jar in the target
    // folder that didn't share this exact filename. For an app whose whole
    // point is deploying multiple different modules into the same
    // mods/plugins folder, that silently wiped out every other module's
    // jar on every single deploy. Only the exact same-named file (backed
    // up above, then overwritten below) is ever touched now.

    if let Err(e) = fs::copy(&artifact_path, &dest) {
        if let Ok(conn) = state.conn.lock() {
            record_deploy_history(
                &conn,
                &user_id,
                server_name.as_deref().unwrap_or("Local Folder"),
                &artifact_name,
                &target_folder,
                "FAILED",
                &e.to_string(),
            );
        }
        return Err(e.to_string());
    }

    if auto_restart {
        if let Some(sid) = &server_id {
            restart_server_internal(sid, &state, &processes, &app)?;
        }
    }

    let result = DeployResult {
        success: true,
        message: format!("Deployed {artifact_name} to {target_folder}"),
        targets: vec![target_folder.clone()],
    };

    if let Ok(conn) = state.conn.lock() {
        record_deploy_history(
            &conn,
            &user_id,
            server_name.as_deref().unwrap_or("Local Folder"),
            &artifact_name,
            &target_folder,
            "SUCCESS",
            &result.message,
        );
    }

    let _ = app.emit("deploy-finished", &result);
    Ok(result)
}

fn fetch_server_config(
    state: &State<'_, DbState>,
    server_id: &str,
) -> Result<ServerConfig, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, name, server_folder, mods_folder, plugins_folder, java_version, startup_script, shutdown_script, working_directory, config, created_at FROM servers WHERE id = ?1",
        params![server_id],
        |r| {
            let config_str: String = r.get(9)?;
            Ok(ServerConfig {
                id: r.get(0)?,
                name: r.get(1)?,
                server_folder: r.get(2)?,
                mods_folder: r.get(3)?,
                plugins_folder: r.get(4)?,
                java_version: r.get(5)?,
                startup_script: r.get(6)?,
                shutdown_script: r.get(7)?,
                working_directory: r.get(8)?,
                config: serde_json::from_str(&config_str).unwrap_or(serde_json::json!({})),
                created_at: r.get(10)?,
            })
        },
    )
    .map_err(|_| "Server not found".to_string())
}

/// Actually restarts the server — kills the current process, waits briefly
/// for the OS to release its handles, then respawns it. The previous
/// version of this function only ever killed the process and never brought
/// it back up, despite every caller (deploy_artifact's "restart after
/// deploy") treating it as a real restart.
fn restart_server_internal(
    server_id: &str,
    state: &State<'_, DbState>,
    processes: &Arc<ServerProcesses>,
    app: &AppHandle,
) -> Result<(), String> {
    let pid = {
        let mut map = processes.processes.lock().map_err(|e| e.to_string())?;
        map.remove(server_id).map(|h| h.pid)
    };
    if let Some(pid) = pid {
        kill_process(pid);
        std::thread::sleep(std::time::Duration::from_secs(2));
    }

    let server = fetch_server_config(state, server_id)?;
    spawn_server(&server, processes, app)?;
    Ok(())
}

pub(crate) fn kill_process(pid: u32) {
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill").arg("-9").arg(pid.to_string()).output();
    }
}

#[tauri::command]
pub fn start_server(
    server: ServerConfig,
    processes: State<'_, Arc<ServerProcesses>>,
    app: AppHandle,
) -> Result<u32, String> {
    spawn_server(&server, &processes, &app)
}

pub(crate) fn spawn_server(
    server: &ServerConfig,
    processes: &Arc<ServerProcesses>,
    app: &AppHandle,
) -> Result<u32, String> {
    let work_dir = server
        .working_directory
        .clone()
        .unwrap_or_else(|| server.server_folder.clone());

    let script = server.startup_script.clone().unwrap_or_else(|| {
        if cfg!(windows) {
            "start.bat".into()
        } else {
            "start.sh".into()
        }
    });

    let script_path = PathBuf::from(&work_dir).join(&script);
    if !script_path.exists() {
        return Err(format!(
            "Startup script not found: {}",
            script_path.display()
        ));
    }

    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.args(["/C", script_path.to_str().unwrap()]);
        c
    } else {
        let mut c = Command::new("sh");
        c.arg(script_path.to_str().unwrap());
        c
    };

    cmd.current_dir(&work_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let pid = child.id();
    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    {
        let mut map = processes.processes.lock().map_err(|e| e.to_string())?;
        map.insert(server.id.clone(), ProcessHandle { pid, stdin });
    }

    if let Some(stdout) = stdout {
        let server_id = server.id.clone();
        let app_clone = app.clone();
        thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(l) => {
                        let _ = app_clone.emit(
                            "server-console-line",
                            serde_json::json!({ "serverId": server_id, "line": l }),
                        );
                    }
                    Err(_) => break,
                }
            }
        });
    }
    if let Some(stderr) = stderr {
        let server_id = server.id.clone();
        let app_clone = app.clone();
        thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(l) => {
                        let _ = app_clone.emit(
                            "server-console-line",
                            serde_json::json!({ "serverId": server_id, "line": l }),
                        );
                    }
                    Err(_) => break,
                }
            }
        });
    }

    let server_id = server.id.clone();
    let app_clone = app.clone();
    thread::spawn(move || {
        if let Ok(status) = child.wait() {
            let _ = app_clone.emit(
                "server-stopped",
                serde_json::json!({ "serverId": server_id, "code": status.code() }),
            );
        }
    });

    Ok(pid)
}

#[tauri::command]
pub fn stop_server(
    server_id: String,
    processes: State<'_, Arc<ServerProcesses>>,
) -> Result<(), String> {
    let pid = {
        let mut map = processes.processes.lock().map_err(|e| e.to_string())?;
        map.remove(&server_id).map(|h| h.pid)
    };
    if let Some(pid) = pid {
        kill_process(pid);
    }
    Ok(())
}

/// Sends a line of text to a running local server's console via its stdin —
/// this is what makes the previously-decorative Console "Send" button
/// actually do something for local servers.
#[tauri::command]
pub fn send_server_command(
    server_id: String,
    command: String,
    processes: State<'_, Arc<ServerProcesses>>,
) -> Result<(), String> {
    use std::io::Write;
    let mut map = processes.processes.lock().map_err(|e| e.to_string())?;
    let handle = map
        .get_mut(&server_id)
        .ok_or_else(|| "Server is not running".to_string())?;
    let stdin = handle
        .stdin
        .as_mut()
        .ok_or_else(|| "No console input available for this server".to_string())?;
    writeln!(stdin, "{command}").map_err(|e| format!("Failed to send command: {e}"))?;
    stdin.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// The PID we track is cmd.exe (which runs start.bat), not the actual
/// java.exe underneath it. Measuring cmd.exe directly would give small,
/// plausible-but-wrong numbers, so this walks down to the real child
/// process before reporting anything.
pub(crate) fn resolve_java_pid(wrapper_pid: u32) -> Option<u32> {
    if !cfg!(windows) {
        return None;
    }
    let script = format!(
        "Get-CimInstance Win32_Process -Filter \"ParentProcessId={wrapper_pid}\" | Where-Object {{ $_.Name -like 'java*' }} | Select-Object -First 1 -ExpandProperty ProcessId"
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u32>()
        .ok()
}

/// Queries real RAM + CPU% for a PID via PowerShell. CPU comes back from
/// .NET as cumulative processor-seconds, so this turns it into a percent
/// using the last sample stored per server (see ServerProcesses.cpu_samples).
/// Any failure at any step returns None rather than panicking or faking a
/// number — callers fall back to 0/unavailable.
pub(crate) fn query_local_process_stats(
    pid: u32,
    server_id: &str,
    processes: &Arc<ServerProcesses>,
) -> Option<(f32, f32)> {
    if !cfg!(windows) {
        return None;
    }
    let script = format!(
        "Get-Process -Id {pid} -ErrorAction SilentlyContinue | Select-Object WorkingSet64,CPU | ConvertTo-Json -Compress"
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(text.trim()).ok()?;
    let working_set = parsed.get("WorkingSet64")?.as_f64()?;
    let cpu_seconds = parsed.get("CPU").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let ram_mb = (working_set / (1024.0 * 1024.0)) as f32;

    let now = std::time::Instant::now();
    let mut samples = processes.cpu_samples.lock().ok()?;
    let cpu_percent = if let Some((prev_time, prev_cpu)) = samples.get(server_id) {
        let elapsed = now.duration_since(*prev_time).as_secs_f64();
        if elapsed > 0.1 {
            let delta_cpu = (cpu_seconds - prev_cpu).max(0.0);
            let cores = std::thread::available_parallelism()
                .map(|n| n.get() as f64)
                .unwrap_or(1.0);
            ((delta_cpu / elapsed) / cores * 100.0).min(100.0)
        } else {
            0.0
        }
    } else {
        0.0
    };
    samples.insert(server_id.to_string(), (now, cpu_seconds));

    Some((ram_mb, cpu_percent as f32))
}

pub(crate) fn query_total_system_ram_mb() -> Option<f32> {
    if !cfg!(windows) {
        return None;
    }
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let bytes: f64 = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .ok()?;
    Some((bytes / (1024.0 * 1024.0)) as f32)
}

#[tauri::command]
pub fn get_server_status(
    server: ServerConfig,
    processes: State<'_, Arc<ServerProcesses>>,
) -> Result<ServerStatus, String> {
    let wrapper_pid = {
        let map = processes.processes.lock().map_err(|e| e.to_string())?;
        map.get(&server.id).map(|h| h.pid)
    };
    let is_running = wrapper_pid.is_some();

    let (ram_usage_mb, cpu_usage) = wrapper_pid
        .and_then(resolve_java_pid)
        .and_then(|java_pid| query_local_process_stats(java_pid, &server.id, &processes))
        .unwrap_or((0.0, 0.0));

    let ram_total_mb = query_total_system_ram_mb().unwrap_or(0.0);

    Ok(ServerStatus {
        id: server.id.clone(),
        name: server.name.clone(),
        status: if is_running {
            "Online".into()
        } else {
            "Offline".into()
        },
        online_players: 0,
        max_players: 0,
        uptime_secs: 0,
        cpu_usage,
        ram_usage_mb,
        ram_total_mb,
        tps: 0.0,
    })
}

#[tauri::command]
pub fn read_log_tail(path: String, lines: usize) -> Result<String, String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let all_lines: Vec<&str> = content.lines().collect();
    let start = all_lines.len().saturating_sub(lines);
    Ok(all_lines[start..].join("\n"))
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 5 * 1024 * 1024 {
        return Err("File is too large to open in the text editor (over 5MB)".into());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Failed to save file: {e}"))
}

#[tauri::command]
pub fn create_deployment_profile_id() -> String {
    Uuid::new_v4().to_string()
}

#[tauri::command]
pub fn create_server_id() -> String {
    Uuid::new_v4().to_string()
}

#[tauri::command]
pub fn backup_server_folder(server_folder: String) -> Result<String, String> {
    let src = PathBuf::from(&server_folder);
    let backup_name = format!("backup_{}", Utc::now().format("%Y%m%d_%H%M%S"));
    let dest = src.parent().unwrap_or(Path::new(".")).join(format!(
        "{}_{}",
        src.file_name().unwrap().to_string_lossy(),
        backup_name
    ));

    copy_dir_recursive(&src, &dest)?;
    Ok(dest.to_string_lossy().to_string())
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let dest_path = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
