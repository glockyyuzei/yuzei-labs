use crate::commands::deploy::{
    kill_process, query_local_process_stats, query_total_system_ram_mb, resolve_java_pid,
    spawn_server, ServerConfig, ServerProcesses, ServerStatus,
};
use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HostedServerConfig {
    pub id: String,
    pub name: String,
    pub server_folder: String,
    pub server_type: String,
    pub jar_path: String,
    pub java_path: Option<String>,
    pub min_memory_mb: i64,
    pub max_memory_mb: i64,
    pub extra_jvm_args: Option<String>,
    pub startup_script_path: String,
    pub cpu_limit_percent: Option<i64>,
    pub rcon_port: Option<i64>,
    pub rcon_password: Option<String>,
    pub env_vars: Option<String>,
    pub created_at: String,
}

fn row_to_server(r: &rusqlite::Row) -> rusqlite::Result<HostedServerConfig> {
    Ok(HostedServerConfig {
        id: r.get(0)?,
        name: r.get(1)?,
        server_folder: r.get(2)?,
        server_type: r.get(3)?,
        jar_path: r.get(4)?,
        java_path: r.get(5)?,
        min_memory_mb: r.get(6)?,
        max_memory_mb: r.get(7)?,
        extra_jvm_args: r.get(8)?,
        startup_script_path: r.get(9)?,
        cpu_limit_percent: r.get(10)?,
        rcon_port: r.get(11)?,
        rcon_password: r.get(12)?,
        env_vars: r.get(13)?,
        created_at: r.get(14)?,
    })
}

const SERVER_COLUMNS: &str = "id, name, server_folder, server_type, jar_path, java_path, min_memory_mb, max_memory_mb, extra_jvm_args, startup_script_path, cpu_limit_percent, rcon_port, rcon_password, env_vars, created_at";

#[tauri::command]
pub fn save_hosted_server(
    state: State<'_, DbState>,
    user_id: String,
    server: HostedServerConfig,
) -> Result<HostedServerConfig, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO hosted_servers (id, user_id, name, server_folder, server_type, jar_path, java_path, min_memory_mb, max_memory_mb, extra_jvm_args, startup_script_path, cpu_limit_percent, rcon_port, rcon_password, env_vars, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
         ON CONFLICT(id) DO UPDATE SET name = ?3, server_folder = ?4, server_type = ?5, jar_path = ?6, java_path = ?7,
             min_memory_mb = ?8, max_memory_mb = ?9, extra_jvm_args = ?10, startup_script_path = ?11,
             cpu_limit_percent = ?12, rcon_port = ?13, rcon_password = ?14, env_vars = ?15",
        params![
            server.id, user_id, server.name, server.server_folder, server.server_type, server.jar_path,
            server.java_path, server.min_memory_mb, server.max_memory_mb, server.extra_jvm_args,
            server.startup_script_path, server.cpu_limit_percent, server.rcon_port, server.rcon_password,
            server.env_vars, server.created_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(server)
}

#[tauri::command]
pub fn get_hosted_servers(
    state: State<'_, DbState>,
    user_id: String,
) -> Result<Vec<HostedServerConfig>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let query = format!(
        "SELECT {SERVER_COLUMNS} FROM hosted_servers WHERE user_id = ?1 ORDER BY created_at DESC"
    );
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user_id], row_to_server)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn delete_hosted_server(
    state: State<'_, DbState>,
    id: String,
    processes: State<'_, Arc<ServerProcesses>>,
) -> Result<(), String> {
    // Make sure we're not leaving an orphaned running process behind.
    let pid = {
        let mut map = processes.processes.lock().map_err(|e| e.to_string())?;
        map.remove(&id).map(|h| h.pid)
    };
    if let Some(pid) = pid {
        kill_process(pid);
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM hosted_servers WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM scheduled_tasks WHERE server_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DetectedJar {
    pub path: String,
    pub filename: String,
    pub server_type: String,
    pub confidence: u8,
}

/// Scans a folder for a server jar and guesses its type from the filename.
/// This is a heuristic, not a certainty — hence the confidence score.
/// Vanilla/Forge/Fabric server jars don't have a universal naming
/// convention, so this can't be perfect; it's meant to pre-fill the
/// creation wizard, not replace the user confirming the right jar.
#[tauri::command]
pub fn detect_server_jar(folder: String) -> Result<Vec<DetectedJar>, String> {
    let dir = PathBuf::from(&folder);
    if !dir.exists() {
        return Err("Folder does not exist".into());
    }
    let mut results = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jar") {
            continue;
        }
        let filename = path.file_name().unwrap().to_string_lossy().to_string();
        let lower = filename.to_lowercase();

        let (server_type, confidence) = if lower.contains("paper") {
            ("paper", 90)
        } else if lower.contains("spigot") {
            ("spigot", 90)
        } else if lower.contains("fabric-server") || lower.contains("fabric_server") {
            ("fabric", 90)
        } else if lower.contains("forge") && lower.contains("installer") {
            ("forge", 60) // installer jar, not the actual server jar — lower confidence
        } else if lower.contains("forge") {
            ("forge", 85)
        } else if lower.starts_with("server")
            || lower.contains("minecraft_server")
            || lower.contains("vanilla")
        {
            ("vanilla", 70)
        } else {
            ("unknown", 30)
        };

        results.push(DetectedJar {
            path: path.to_string_lossy().to_string(),
            filename,
            server_type: server_type.to_string(),
            confidence,
        });
    }
    // Best guesses first.
    results.sort_by(|a, b| b.confidence.cmp(&a.confidence));
    Ok(results)
}

#[derive(Debug, Deserialize)]
pub struct StartupScriptDraft {
    pub server_folder: String,
    pub jar_path: String,
    pub java_path: Option<String>,
    pub min_memory_mb: i64,
    pub max_memory_mb: i64,
    pub extra_jvm_args: Option<String>,
}

/// Generates a start.bat/start.sh in the server folder from the wizard's
/// settings. Returns the path to the generated script.
#[tauri::command]
pub fn generate_startup_script(draft: StartupScriptDraft) -> Result<String, String> {
    let java = draft
        .java_path
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(|| "java".to_string());
    let jar_filename = PathBuf::from(&draft.jar_path)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .ok_or("Invalid jar path")?;
    let extra_args = draft.extra_jvm_args.unwrap_or_default();

    let folder = PathBuf::from(&draft.server_folder);
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;

    // Auto-accept the EULA if it isn't already there — otherwise a freshly
    // generated server just exits immediately on first run with no
    // explanation the wizard could realistically anticipate for the user.
    let eula_path = folder.join("eula.txt");
    if !eula_path.exists() {
        fs::write(&eula_path, "eula=true\n").ok();
    }

    let script_path;
    let script_content;

    if cfg!(windows) {
        script_path = folder.join("start.bat");
        script_content = format!(
            "@echo off\r\n\"{java}\" -Xms{min}M -Xmx{max}M {extra} -jar \"{jar}\" nogui\r\npause\r\n",
            java = java,
            min = draft.min_memory_mb,
            max = draft.max_memory_mb,
            extra = extra_args,
            jar = jar_filename,
        );
    } else {
        script_path = folder.join("start.sh");
        script_content = format!(
            "#!/bin/sh\n\"{java}\" -Xms{min}M -Xmx{max}M {extra} -jar \"{jar}\" nogui\n",
            java = java,
            min = draft.min_memory_mb,
            max = draft.max_memory_mb,
            extra = extra_args,
            jar = jar_filename,
        );
    }

    fs::write(&script_path, script_content).map_err(|e| e.to_string())?;

    #[cfg(not(windows))]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(&script_path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o755);
            let _ = fs::set_permissions(&script_path, perms);
        }
    }

    Ok(script_path.to_string_lossy().to_string())
}

fn to_deploy_server_config(server: &HostedServerConfig) -> ServerConfig {
    // Self-Hosting Panel servers are started through exactly the same
    // spawn/stdin/stdout-streaming path as Deploy's local servers — this
    // adapter just reshapes the data into the struct that path expects,
    // rather than duplicating process-spawn logic a second time.
    ServerConfig {
        id: server.id.clone(),
        name: server.name.clone(),
        server_folder: server.server_folder.clone(),
        mods_folder: None,
        plugins_folder: None,
        java_version: server.java_path.clone(),
        startup_script: PathBuf::from(&server.startup_script_path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string()),
        shutdown_script: None,
        working_directory: Some(server.server_folder.clone()),
        config: serde_json::json!({}),
        created_at: server.created_at.clone(),
    }
}

#[tauri::command]
pub fn start_hosted_server(
    state: State<'_, DbState>,
    id: String,
    processes: State<'_, Arc<ServerProcesses>>,
    app: AppHandle,
) -> Result<u32, String> {
    let server = fetch_hosted_server(&state, &id)?;
    spawn_server(&to_deploy_server_config(&server), &processes, &app)
}

#[tauri::command]
pub fn stop_hosted_server(
    id: String,
    processes: State<'_, Arc<ServerProcesses>>,
) -> Result<(), String> {
    let pid = {
        let mut map = processes.processes.lock().map_err(|e| e.to_string())?;
        map.remove(&id).map(|h| h.pid)
    };
    if let Some(pid) = pid {
        kill_process(pid);
    }
    Ok(())
}

fn fetch_hosted_server(state: &State<'_, DbState>, id: &str) -> Result<HostedServerConfig, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let query = format!("SELECT {SERVER_COLUMNS} FROM hosted_servers WHERE id = ?1");
    conn.query_row(&query, params![id], row_to_server)
        .map_err(|_| "Server not found".to_string())
}

#[tauri::command]
pub fn get_hosted_server_status(
    state: State<'_, DbState>,
    id: String,
    processes: State<'_, Arc<ServerProcesses>>,
) -> Result<ServerStatus, String> {
    let server = fetch_hosted_server(&state, &id)?;

    let wrapper_pid = {
        let map = processes.processes.lock().map_err(|e| e.to_string())?;
        map.get(&id).map(|h| h.pid)
    };
    let is_running = wrapper_pid.is_some();

    let (ram_usage_mb, cpu_usage) = wrapper_pid
        .and_then(resolve_java_pid)
        .and_then(|java_pid| query_local_process_stats(java_pid, &id, &processes))
        .unwrap_or((0.0, 0.0));

    let ram_total_mb = query_total_system_ram_mb().unwrap_or(0.0);

    // Real player count/TPS via RCON if it's configured for this server —
    // this is the piece Deploy's remote (Pterodactyl) servers can never
    // get, since RCON needs direct network access to the game process,
    // which only exists for servers you're actually hosting yourself.
    let (online_players, max_players, tps) = if is_running {
        match (server.rcon_port, server.rcon_password.as_deref()) {
            (Some(port), Some(password)) if !password.is_empty() => {
                rcon_query_players_and_tps(port as u16, password).unwrap_or((0, 0, 0.0))
            }
            _ => (0, 0, 0.0),
        }
    } else {
        (0, 0, 0.0)
    };

    Ok(ServerStatus {
        id: server.id,
        name: server.name,
        status: if is_running {
            "Online".into()
        } else {
            "Offline".into()
        },
        online_players,
        max_players,
        uptime_secs: 0,
        cpu_usage,
        ram_usage_mb,
        ram_total_mb,
        tps,
    })
}

// ---------------------------------------------------------------------
// RCON — Minecraft's Source RCON protocol, implemented from scratch on
// plain TCP (no crate needed). Used for console commands, player list,
// kick/ban/op, and (best-effort, via "/list" and a plugin-dependent
// "/tps") the status numbers Deploy's remote servers can never get.
// ---------------------------------------------------------------------

const RCON_TYPE_AUTH: i32 = 3;
const RCON_TYPE_AUTH_RESPONSE: i32 = 2;
const RCON_TYPE_COMMAND: i32 = 2;
const RCON_TYPE_RESPONSE: i32 = 0;

fn rcon_write_packet(
    stream: &mut std::net::TcpStream,
    id: i32,
    packet_type: i32,
    body: &str,
) -> std::io::Result<()> {
    use std::io::Write;
    let body_bytes = body.as_bytes();
    let size = 4 + 4 + body_bytes.len() + 2;
    let mut packet = Vec::with_capacity(4 + size);
    packet.extend_from_slice(&(size as i32).to_le_bytes());
    packet.extend_from_slice(&id.to_le_bytes());
    packet.extend_from_slice(&packet_type.to_le_bytes());
    packet.extend_from_slice(body_bytes);
    packet.extend_from_slice(&[0, 0]);
    stream.write_all(&packet)
}

fn rcon_read_packet(stream: &mut std::net::TcpStream) -> std::io::Result<(i32, i32, String)> {
    use std::io::Read;
    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf)?;
    let len = i32::from_le_bytes(len_buf) as usize;

    let mut rest = vec![0u8; len];
    stream.read_exact(&mut rest)?;

    let id = i32::from_le_bytes(rest[0..4].try_into().unwrap());
    let packet_type = i32::from_le_bytes(rest[4..8].try_into().unwrap());
    // Body is everything after the 8-byte header, minus the two trailing
    // null bytes every RCON packet ends with.
    let body_end = rest.len().saturating_sub(2);
    let body = String::from_utf8_lossy(&rest[8..body_end]).to_string();

    Ok((id, packet_type, body))
}

fn rcon_connect(port: u16, password: &str) -> Result<std::net::TcpStream, String> {
    use std::net::TcpStream;
    use std::time::Duration;

    let mut stream =
        TcpStream::connect(("127.0.0.1", port)).map_err(|e| format!("RCON connect failed: {e}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;

    rcon_write_packet(&mut stream, 1, RCON_TYPE_AUTH, password).map_err(|e| e.to_string())?;
    let (resp_id, _, _) = rcon_read_packet(&mut stream).map_err(|e| e.to_string())?;
    // A failed auth echoes back request ID -1 rather than the ID we sent.
    if resp_id == -1 {
        return Err("RCON authentication failed — check the RCON password".into());
    }
    let _ = RCON_TYPE_AUTH_RESPONSE; // documents the expected response type; server behavior varies enough not to hard-assert on it

    Ok(stream)
}

fn rcon_send(port: u16, password: &str, command: &str) -> Result<String, String> {
    let mut stream = rcon_connect(port, password)?;
    rcon_write_packet(&mut stream, 2, RCON_TYPE_COMMAND, command).map_err(|e| e.to_string())?;
    let (_, _, body) = rcon_read_packet(&mut stream).map_err(|e| e.to_string())?;
    let _ = RCON_TYPE_RESPONSE;
    Ok(body)
}

#[tauri::command]
pub fn rcon_command(port: u16, password: String, command: String) -> Result<String, String> {
    rcon_send(port, &password, &command)
}

/// Best-effort player count via vanilla "/list" (works everywhere) and TPS
/// via "/tps" (Bukkit/Spigot/Paper/Forge-with-mod only — plain vanilla
/// doesn't have this command, so a failure here is expected and silently
/// treated as "unavailable" rather than an error).
fn rcon_query_players_and_tps(port: u16, password: &str) -> Result<(u32, u32, f32), String> {
    let list_response = rcon_send(port, password, "list")?;
    let (online, max) = parse_player_list(&list_response);

    let tps = rcon_send(port, password, "tps")
        .ok()
        .and_then(|r| parse_tps(&r))
        .unwrap_or(0.0);

    Ok((online, max, tps))
}

/// Parses vanilla's "There are X of a max of Y players online: ..." line.
fn parse_player_list(text: &str) -> (u32, u32) {
    let re = regex::Regex::new(r"(\d+)\s+of\s+(?:a\s+)?max(?:imum)?\s+(?:of\s+)?(\d+)").unwrap();
    if let Some(caps) = re.captures(text) {
        let online = caps
            .get(1)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0);
        let max = caps
            .get(2)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0);
        return (online, max);
    }
    (0, 0)
}

/// Parses the first decimal number out of a Paper/Spigot "/tps" response
/// (format varies by server software, so this deliberately just grabs the
/// first plausible TPS-looking number rather than assuming exact wording).
fn parse_tps(text: &str) -> Option<f32> {
    let re = regex::Regex::new(r"(\d{1,2}\.\d{1,2})").ok()?;
    re.captures(text)?.get(1)?.as_str().parse().ok()
}

// ---------------------------------------------------------------------
// Plugin/mod manager — enable/disable by renaming with/without a
// ".disabled" suffix. Deliberately no DB table for this: the folder on
// disk IS the source of truth, so a DB copy could only ever drift out of
// sync with what's actually there.
// ---------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PluginEntry {
    pub name: String,
    pub path: String,
    pub enabled: bool,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn list_plugins(folder: String) -> Result<Vec<PluginEntry>, String> {
    let dir = PathBuf::from(&folder);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let filename = path.file_name().unwrap().to_string_lossy().to_string();
        let enabled = filename.ends_with(".jar");
        let is_disabled_jar = filename.ends_with(".jar.disabled");
        if !enabled && !is_disabled_jar {
            continue;
        }
        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        let display_name = filename.trim_end_matches(".disabled").to_string();
        entries.push(PluginEntry {
            name: display_name,
            path: path.to_string_lossy().to_string(),
            enabled,
            size_bytes: size,
        });
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

#[tauri::command]
pub fn toggle_plugin(path: String, enable: bool) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let new_path = if enable {
        PathBuf::from(path.trim_end_matches(".disabled"))
    } else if path.ends_with(".disabled") {
        p.clone()
    } else {
        PathBuf::from(format!("{path}.disabled"))
    };
    if new_path != p {
        fs::rename(&p, &new_path).map_err(|e| e.to_string())?;
    }
    Ok(new_path.to_string_lossy().to_string())
}

// ---------------------------------------------------------------------
// Scheduled tasks (restart / backup on an interval). Execution only
// happens while Yuzei Labs itself is running — there's no OS-level
// scheduler involved, so this is a lightweight in-app timer, not a
// guarantee the task fires if the app is closed.
// ---------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledTask {
    pub id: String,
    pub server_id: String,
    pub task_type: String,
    pub interval_minutes: i64,
    pub last_run_at: Option<String>,
    pub enabled: bool,
    pub created_at: String,
}

#[tauri::command]
pub fn save_scheduled_task(
    state: State<'_, DbState>,
    task: ScheduledTask,
) -> Result<ScheduledTask, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO scheduled_tasks (id, server_id, task_type, interval_minutes, last_run_at, enabled, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET task_type = ?3, interval_minutes = ?4, enabled = ?6",
        params![
            task.id, task.server_id, task.task_type, task.interval_minutes,
            task.last_run_at, task.enabled as i64, task.created_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(task)
}

#[tauri::command]
pub fn get_scheduled_tasks(
    state: State<'_, DbState>,
    server_id: String,
) -> Result<Vec<ScheduledTask>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, server_id, task_type, interval_minutes, last_run_at, enabled, created_at FROM scheduled_tasks WHERE server_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![server_id], |r| {
            let enabled: i64 = r.get(5)?;
            Ok(ScheduledTask {
                id: r.get(0)?,
                server_id: r.get(1)?,
                task_type: r.get(2)?,
                interval_minutes: r.get(3)?,
                last_run_at: r.get(4)?,
                enabled: enabled != 0,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn delete_scheduled_task(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM scheduled_tasks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn run_backup_now(
    state: State<'_, DbState>,
    server_id: String,
    backup_dir: String,
) -> Result<String, String> {
    let server = fetch_hosted_server(&state, &server_id)?;
    let src = PathBuf::from(&server.server_folder);
    let dest_root = PathBuf::from(&backup_dir);
    fs::create_dir_all(&dest_root).map_err(|e| e.to_string())?;

    let backup_name = format!(
        "{}_{}",
        server.name,
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    );
    let dest = dest_root.join(&backup_name);
    copy_dir_recursive_skip_dotfiles(&src, &dest)?;

    let size_bytes = dir_size(&dest);
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO hosted_server_backups (id, server_id, file_path, size_bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, server_id, dest.to_string_lossy().to_string(), size_bytes as i64, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(dest.to_string_lossy().to_string())
}

fn copy_dir_recursive_skip_dotfiles(
    src: &std::path::Path,
    dest: &std::path::Path,
) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let dest_path = dest.join(&name);
        if entry.path().is_dir() {
            copy_dir_recursive_skip_dotfiles(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn dir_size(path: &std::path::Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total += dir_size(&p);
            } else {
                total += fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    total
}
