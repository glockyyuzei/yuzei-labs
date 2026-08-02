use crate::auth;
use crate::db::DbState;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: String,
    pub username: String,
    pub email: String,
    pub avatar: String,
    pub joined_at: String,
    pub last_login: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub token: String,
    pub user: UserProfile,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub identifier: String,
    pub password: String,
    pub remember_me: bool,
}

#[tauri::command]
pub fn register_user(
    state: tauri::State<'_, DbState>,
    req: RegisterRequest,
) -> Result<AuthResponse, String> {
    if req.username.len() < 3 {
        return Err("Username must be at least 3 characters".into());
    }
    if !req.email.contains('@') {
        return Err("Invalid email address".into());
    }
    if req.password.len() < 6 {
        return Err("Password must be at least 6 characters".into());
    }

    let hash = auth::hash_password(&req.password)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let token = Uuid::new_v4().to_string();

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO users (id, username, email, password_hash, avatar, joined_at, last_login) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, req.username, req.email, hash, "", now, now],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "Username or email already exists".to_string()
        } else {
            e.to_string()
        }
    })?;

    conn.execute(
        "INSERT INTO sessions (token, user_id, remember_me, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![token, id, 1, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(AuthResponse {
        token,
        user: UserProfile {
            id,
            username: req.username,
            email: req.email,
            avatar: String::new(),
            joined_at: now.clone(),
            last_login: Some(now),
        },
    })
}

#[tauri::command]
pub fn login_user(state: tauri::State<'_, DbState>, req: LoginRequest) -> Result<AuthResponse, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let row: Result<(String, String, String, String, String, String, Option<String>), _> = conn.query_row(
        "SELECT id, username, email, password_hash, avatar, joined_at, last_login FROM users WHERE username = ?1 OR email = ?1",
        params![req.identifier],
        |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
            ))
        },
    );

    let (id, username, email, hash, avatar, joined_at, _) = row.map_err(|_| "Invalid credentials")?;

    if !auth::verify_password(&req.password, &hash)? {
        return Err("Invalid credentials".into());
    }

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE users SET last_login = ?1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;

    let token = Uuid::new_v4().to_string();
    let remember = if req.remember_me { 1 } else { 0 };
    conn.execute(
        "INSERT INTO sessions (token, user_id, remember_me, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![token, id, remember, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(AuthResponse {
        token,
        user: UserProfile {
            id,
            username,
            email,
            avatar,
            joined_at,
            last_login: Some(now),
        },
    })
}

#[tauri::command]
pub fn validate_session(
    state: tauri::State<'_, DbState>,
    token: String,
) -> Result<UserProfile, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT u.id, u.username, u.email, u.avatar, u.joined_at, u.last_login
         FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?1",
        params![token],
        |r| {
            Ok(UserProfile {
                id: r.get(0)?,
                username: r.get(1)?,
                email: r.get(2)?,
                avatar: r.get(3)?,
                joined_at: r.get(4)?,
                last_login: r.get(5)?,
            })
        },
    )
    .map_err(|_| "Session expired".into())
}

#[tauri::command]
pub fn logout_user(state: tauri::State<'_, DbState>, token: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sessions WHERE token = ?1", params![token])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn change_password(
    state: tauri::State<'_, DbState>,
    user_id: String,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    if new_password.len() < 6 {
        return Err("New password must be at least 6 characters".into());
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let hash: String = conn
        .query_row(
            "SELECT password_hash FROM users WHERE id = ?1",
            params![user_id],
            |r| r.get(0),
        )
        .map_err(|_| "User not found".to_string())?;

    if !auth::verify_password(&current_password, &hash)? {
        return Err("Current password is incorrect".into());
    }

    let new_hash = auth::hash_password(&new_password)?;
    conn.execute(
        "UPDATE users SET password_hash = ?1 WHERE id = ?2",
        params![new_hash, user_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM sessions WHERE user_id = ?1", params![user_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_avatar(
    state: tauri::State<'_, DbState>,
    user_id: String,
    avatar: String,
) -> Result<UserProfile, String> {
    if avatar.len() > 2 * 1024 * 1024 {
        return Err("Image is too large — please use a smaller picture".into());
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE users SET avatar = ?1 WHERE id = ?2",
        params![avatar, user_id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, username, email, avatar, joined_at, last_login FROM users WHERE id = ?1",
        params![user_id],
        |r| {
            Ok(UserProfile {
                id: r.get(0)?,
                username: r.get(1)?,
                email: r.get(2)?,
                avatar: r.get(3)?,
                joined_at: r.get(4)?,
                last_login: r.get(5)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}
