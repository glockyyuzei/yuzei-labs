use crate::commands::deploy::{FileEntry, ServerStatus};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fs;

/// reqwest's `.json::<T>()` collapses real deserialization failures down to
/// a bare "error decoding response body" with no detail about what field
/// mismatched or what the panel actually sent back. This reads the raw body
/// first and parses it manually so failures come with the serde error
/// (field name, line/column) plus a snippet of the actual response —
/// essential for debugging against a panel we can't inspect directly, and
/// especially for provider-customized Pterodactyl panels whose responses
/// may not match the stock API 1:1.
async fn parse_json<T: DeserializeOwned>(response: reqwest::Response) -> Result<T, String> {
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;
    serde_json::from_str::<T>(&body).map_err(|e| {
        let snippet: String = body.chars().take(300).collect();
        format!("Unexpected response shape from panel: {e}\nRaw response: {snippet}")
    })
}

/// Normalizes a panel URL (strips trailing slash) so callers can paste
/// either "https://panel.example.com" or "https://panel.example.com/".
fn normalize_panel_url(panel_url: &str) -> String {
    panel_url.trim_end_matches('/').to_string()
}

/// Pterodactyl returns errors as `{"errors":[{"code":...,"detail":...}]}`.
/// This pulls a human-readable message out of that shape, falling back to
/// the raw HTTP status if the body isn't in the expected format.
async fn extract_error(response: reqwest::Response) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    #[derive(Deserialize)]
    struct ErrBody {
        errors: Vec<ErrEntry>,
    }
    #[derive(Deserialize)]
    struct ErrEntry {
        detail: Option<String>,
        code: Option<String>,
    }

    if let Ok(parsed) = serde_json::from_str::<ErrBody>(&body) {
        if let Some(msg) = parsed
            .errors
            .first()
            .map(|e| {
                e.detail
                    .clone()
                    .unwrap_or_else(|| e.code.clone().unwrap_or_default())
            })
            .filter(|s| !s.is_empty())
        {
            return msg;
        }
    }

    // Not a Pterodactyl-shaped JSON error — likely a WAF/Cloudflare block page,
    // a wrong panel URL, or a proxy in front of the panel. Surface a snippet
    // of whatever actually came back so it's diagnosable instead of a bare
    // status code.
    let looks_like_html = body.trim_start().starts_with('<');
    if looks_like_html {
        format!(
            "Pterodactyl API error: {status} (the panel returned an HTML page instead of JSON — likely a Cloudflare/WAF block, a wrong Panel URL, or the panel requiring browser verification rather than API access)"
        )
    } else if body.trim().is_empty() {
        format!("Pterodactyl API error: {status}")
    } else {
        let snippet: String = body.chars().take(200).collect();
        format!("Pterodactyl API error: {status} — {snippet}")
    }
}

fn client() -> reqwest::Client {
    reqwest::Client::new()
}

fn auth_headers(api_key: &str) -> reqwest::header::HeaderMap {
    // Defend against the two most common copy-paste mistakes: trailing
    // whitespace/newlines from clipboard managers, and the user pasting
    // "Bearer ptlc_..." (with the scheme already included) into the key
    // field, which would otherwise silently become "Bearer Bearer ptlc_...".
    let cleaned = api_key.trim().trim_start_matches("Bearer ").trim();

    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        format!("Bearer {cleaned}").parse().unwrap(),
    );
    headers.insert(reqwest::header::ACCEPT, "application/json".parse().unwrap());
    // Many panels sit behind Cloudflare or another WAF that blocks requests
    // with no User-Agent at all (reqwest sends none by default), returning a
    // bare 403 before the request ever reaches Pterodactyl itself.
    headers.insert(
        reqwest::header::USER_AGENT,
        "YuzeiLabs/1.0 (+https://github.com/)".parse().unwrap(),
    );
    headers
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PterodactylServer {
    pub identifier: String,
    pub name: String,
    pub node: String,
    pub description: String,
}

/// Lists every server the given Pterodactyl API key has access to, so the
/// user can pick which one a Yuzei Labs server profile maps to.
/// Triggers a real server backup on the panel side (Pterodactyl handles the
/// actual file archiving on the node) — the remote counterpart to the
/// existing local-folder-copy Backup button, which only ever worked for
/// local servers.
#[tauri::command]
pub async fn pterodactyl_create_backup(
    panel_url: String,
    api_key: String,
    server_id: String,
    name: Option<String>,
) -> Result<String, String> {
    let base = normalize_panel_url(&panel_url);
    let mut body = serde_json::Map::new();
    if let Some(n) = name {
        body.insert("name".into(), serde_json::Value::String(n));
    }

    let response = client()
        .post(format!("{base}/api/client/servers/{server_id}/backups"))
        .headers(auth_headers(&api_key))
        .json(&serde_json::Value::Object(body))
        .send()
        .await
        .map_err(|e| format!("Failed to reach panel: {e}"))?;

    if !response.status().is_success() {
        return Err(extract_error(response).await);
    }

    #[derive(Deserialize)]
    struct BackupResponse {
        attributes: BackupAttrs,
    }
    #[derive(Deserialize)]
    struct BackupAttrs {
        name: String,
        uuid: String,
    }
    let parsed: BackupResponse = parse_json(response).await?;
    Ok(format!(
        "{} ({})",
        parsed.attributes.name, parsed.attributes.uuid
    ))
}

#[tauri::command]
pub async fn pterodactyl_list_servers(
    panel_url: String,
    api_key: String,
) -> Result<Vec<PterodactylServer>, String> {
    let base = normalize_panel_url(&panel_url);
    let response = client()
        .get(format!("{base}/api/client"))
        .headers(auth_headers(&api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to reach panel: {e}"))?;

    if !response.status().is_success() {
        return Err(extract_error(response).await);
    }

    #[derive(Deserialize)]
    struct ListResponse {
        data: Vec<ServerEntry>,
    }
    #[derive(Deserialize)]
    struct ServerEntry {
        attributes: ServerAttrs,
    }
    #[derive(Deserialize)]
    struct ServerAttrs {
        identifier: String,
        name: String,
        description: Option<String>,
        node: Option<String>,
    }

    let parsed: ListResponse = parse_json(response).await?;
    Ok(parsed
        .data
        .into_iter()
        .map(|s| PterodactylServer {
            identifier: s.attributes.identifier,
            name: s.attributes.name,
            node: s.attributes.node.unwrap_or_default(),
            description: s.attributes.description.unwrap_or_default(),
        })
        .collect())
}

/// Fetches real, live CPU/RAM/disk/uptime/state from the panel — replaces
/// the previous hardcoded placeholder values for Pterodactyl-backed servers.
/// Note: Pterodactyl's base resources endpoint doesn't expose Minecraft
/// player count or TPS (that data lives inside the game server itself, via
/// query protocol or a plugin), so those two fields come back as 0 here.
#[tauri::command]
pub async fn pterodactyl_get_status(
    panel_url: String,
    api_key: String,
    server_id: String,
    server_name: String,
) -> Result<ServerStatus, String> {
    let base = normalize_panel_url(&panel_url);
    let response = client()
        .get(format!("{base}/api/client/servers/{server_id}/resources"))
        .headers(auth_headers(&api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to reach panel: {e}"))?;

    if !response.status().is_success() {
        return Err(extract_error(response).await);
    }

    #[derive(Deserialize)]
    struct ResourcesResponse {
        attributes: ResourceAttrs,
    }
    #[derive(Deserialize)]
    struct ResourceAttrs {
        current_state: String,
        resources: ResourceStats,
    }
    #[derive(Deserialize)]
    struct ResourceStats {
        memory_bytes: u64,
        cpu_absolute: f32,
        uptime: u64,
    }

    let parsed: ResourcesResponse = parse_json(response).await?;
    let status = match parsed.attributes.current_state.as_str() {
        "running" => "RUNNING",
        "starting" => "STARTING",
        "stopping" => "STOPPING",
        _ => "STOPPED",
    };

    Ok(ServerStatus {
        id: server_id,
        name: server_name,
        status: status.to_string(),
        online_players: 0,
        max_players: 0,
        uptime_secs: parsed.attributes.resources.uptime / 1000,
        cpu_usage: parsed.attributes.resources.cpu_absolute,
        ram_usage_mb: parsed.attributes.resources.memory_bytes as f32 / (1024.0 * 1024.0),
        ram_total_mb: 0.0,
        tps: 0.0,
    })
}

/// Sends a power action (start/stop/restart/kill) to a remote Pterodactyl
/// server — this is the real equivalent of the local start_server/stop_server
/// commands, for servers that live on a host like UltraServers instead of
/// the machine Yuzei Labs runs on.
/// Sends a command to a remote server's console via the panel — the
/// remote counterpart to send_server_command. This doesn't need RCON or
/// any direct network access to the game server itself; Pterodactyl
/// forwards it through the panel/wings the same way the web console does.
#[tauri::command]
pub async fn pterodactyl_send_command(
    panel_url: String,
    api_key: String,
    server_id: String,
    command: String,
) -> Result<(), String> {
    let base = normalize_panel_url(&panel_url);
    let response = client()
        .post(format!("{base}/api/client/servers/{server_id}/command"))
        .headers(auth_headers(&api_key))
        .json(&serde_json::json!({ "command": command }))
        .send()
        .await
        .map_err(|e| format!("Failed to reach panel: {e}"))?;

    if !response.status().is_success() {
        return Err(extract_error(response).await);
    }
    Ok(())
}

#[tauri::command]
pub async fn pterodactyl_power_action(
    panel_url: String,
    api_key: String,
    server_id: String,
    signal: String,
) -> Result<(), String> {
    let base = normalize_panel_url(&panel_url);
    let response = client()
        .post(format!("{base}/api/client/servers/{server_id}/power"))
        .headers(auth_headers(&api_key))
        .json(&serde_json::json!({ "signal": signal }))
        .send()
        .await
        .map_err(|e| format!("Failed to reach panel: {e}"))?;

    if !response.status().is_success() {
        return Err(extract_error(response).await);
    }
    Ok(())
}

#[tauri::command]
pub async fn pterodactyl_list_files(
    panel_url: String,
    api_key: String,
    server_id: String,
    directory: String,
) -> Result<Vec<FileEntry>, String> {
    let base = normalize_panel_url(&panel_url);
    let response = client()
        .get(format!("{base}/api/client/servers/{server_id}/files/list"))
        .headers(auth_headers(&api_key))
        .query(&[("directory", directory.as_str())])
        .send()
        .await
        .map_err(|e| format!("Failed to reach panel: {e}"))?;

    if !response.status().is_success() {
        return Err(extract_error(response).await);
    }

    #[derive(Deserialize)]
    struct ListResponse {
        data: Vec<FileItem>,
    }
    #[derive(Deserialize)]
    struct FileItem {
        attributes: FileAttrs,
    }
    #[derive(Deserialize)]
    struct FileAttrs {
        name: String,
        size: u64,
        is_file: bool,
        modified_at: String,
    }

    let parsed: ListResponse = parse_json(response).await?;
    let dir = directory.trim_end_matches('/');
    Ok(parsed
        .data
        .into_iter()
        .map(|f| FileEntry {
            path: format!("{dir}/{}", f.attributes.name),
            name: f.attributes.name,
            is_dir: !f.attributes.is_file,
            size: f.attributes.size,
            modified: f.attributes.modified_at,
        })
        .collect())
}

/// Reads a remote file's raw contents — used for tailing latest.log as a
/// practical substitute for full websocket console streaming, which isn't
/// implemented in this pass.
#[tauri::command]
pub async fn pterodactyl_read_file(
    panel_url: String,
    api_key: String,
    server_id: String,
    file_path: String,
) -> Result<String, String> {
    let base = normalize_panel_url(&panel_url);
    let response = client()
        .get(format!(
            "{base}/api/client/servers/{server_id}/files/contents"
        ))
        .headers(auth_headers(&api_key))
        .query(&[("file", file_path.as_str())])
        .send()
        .await
        .map_err(|e| format!("Failed to reach panel: {e}"))?;

    if !response.status().is_success() {
        return Err(extract_error(response).await);
    }
    response.text().await.map_err(|e| e.to_string())
}

/// Deploys a built artifact to a remote Pterodactyl server. This is a
/// two-step dance per Pterodactyl's API: first request a short-lived signed
/// upload URL, then multipart-POST the file bytes directly to it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleCredentials {
    pub token: String,
    pub socket: String,
}

/// Fetches a short-lived signed token + websocket URL for a server's live
/// console. The actual WebSocket connection is opened from the frontend
/// directly (the Tauri webview supports the standard browser WebSocket API
/// natively) — this just does the authenticated REST call to get
/// credentials, since that needs the account API key.
#[tauri::command]
pub async fn pterodactyl_get_console_credentials(
    panel_url: String,
    api_key: String,
    server_id: String,
) -> Result<ConsoleCredentials, String> {
    let base = normalize_panel_url(&panel_url);
    let response = client()
        .get(format!("{base}/api/client/servers/{server_id}/websocket"))
        .headers(auth_headers(&api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to reach panel: {e}"))?;

    if !response.status().is_success() {
        return Err(extract_error(response).await);
    }

    #[derive(Deserialize)]
    struct WsResponse {
        data: WsData,
    }
    #[derive(Deserialize)]
    struct WsData {
        token: String,
        socket: String,
    }
    let parsed: WsResponse = parse_json(response).await?;
    Ok(ConsoleCredentials {
        token: parsed.data.token,
        socket: parsed.data.socket,
    })
}

/// Writes text content to a file on the remote server — used by the File
/// Manager's edit-and-save flow for logs, configs, and other text files.
#[tauri::command]
pub async fn pterodactyl_write_file(
    panel_url: String,
    api_key: String,
    server_id: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let base = normalize_panel_url(&panel_url);
    let response = client()
        .post(format!("{base}/api/client/servers/{server_id}/files/write"))
        .headers(auth_headers(&api_key))
        .query(&[("file", file_path.as_str())])
        .header(reqwest::header::CONTENT_TYPE, "text/plain")
        .body(content)
        .send()
        .await
        .map_err(|e| format!("Failed to reach panel: {e}"))?;

    if !response.status().is_success() {
        return Err(extract_error(response).await);
    }
    Ok(())
}

#[tauri::command]
pub async fn pterodactyl_deploy_artifact(
    state: tauri::State<'_, crate::db::DbState>,
    user_id: String,
    server_name: String,
    panel_url: String,
    api_key: String,
    server_id: String,
    local_file_path: String,
    target_directory: String,
) -> Result<(), String> {
    let artifact_name = std::path::Path::new(&local_file_path)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "artifact.jar".to_string());

    let result = pterodactyl_upload(
        &panel_url,
        &api_key,
        &server_id,
        &local_file_path,
        &target_directory,
        &artifact_name,
    )
    .await;

    if let Ok(conn) = state.conn.lock() {
        match &result {
            Ok(()) => crate::commands::deploy::record_deploy_history(
                &conn,
                &user_id,
                &server_name,
                &artifact_name,
                &target_directory,
                "SUCCESS",
                &format!("Uploaded to {server_name} ({target_directory})"),
            ),
            Err(e) => crate::commands::deploy::record_deploy_history(
                &conn,
                &user_id,
                &server_name,
                &artifact_name,
                &target_directory,
                "FAILED",
                e,
            ),
        }
    }

    result
}

async fn pterodactyl_upload(
    panel_url: &str,
    api_key: &str,
    server_id: &str,
    local_file_path: &str,
    target_directory: &str,
    filename: &str,
) -> Result<(), String> {
    let base = normalize_panel_url(panel_url);
    let c = client();

    let signed = c
        .get(format!(
            "{base}/api/client/servers/{server_id}/files/upload"
        ))
        .headers(auth_headers(api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to reach panel: {e}"))?;

    if !signed.status().is_success() {
        return Err(extract_error(signed).await);
    }

    #[derive(Deserialize)]
    struct SignedUrl {
        attributes: SignedUrlAttrs,
    }
    #[derive(Deserialize)]
    struct SignedUrlAttrs {
        url: String,
    }
    let signed_url: SignedUrl = parse_json(signed).await?;

    let bytes = fs::read(local_file_path).map_err(|e| format!("Failed to read artifact: {e}"))?;

    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.to_string())
        .mime_str("application/java-archive")
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new().part("files", part);

    let upload = c
        .post(&signed_url.attributes.url)
        .query(&[("directory", target_directory)])
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Upload failed: {e}"))?;

    if !upload.status().is_success() {
        return Err(extract_error(upload).await);
    }
    Ok(())
}
