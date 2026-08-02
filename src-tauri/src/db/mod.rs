use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct DbState {
    pub conn: Mutex<Connection>,
}

impl DbState {
    pub fn new(app: &AppHandle) -> Result<Self> {
        let data_dir = app
            .path()
            .app_data_dir()
            .expect("failed to resolve app data dir");
        std::fs::create_dir_all(&data_dir).ok();
        let db_path: PathBuf = data_dir.join("yuzei-labs.db");
        let conn = Connection::open(db_path)?;
        init_schema(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            avatar TEXT DEFAULT '',
            joined_at TEXT NOT NULL,
            last_login TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            remember_me INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS recent_workspaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            path TEXT NOT NULL,
            name TEXT NOT NULL,
            project_type TEXT NOT NULL,
            version TEXT,
            opened_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS recent_tools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            tool_id TEXT NOT NULL,
            used_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS deployment_profiles (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            project_path TEXT,
            target_type TEXT NOT NULL,
            config TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS servers (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            server_folder TEXT NOT NULL,
            mods_folder TEXT,
            plugins_folder TEXT,
            java_version TEXT,
            startup_script TEXT,
            shutdown_script TEXT,
            working_directory TEXT,
            config TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS build_history (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            project_path TEXT NOT NULL,
            project_name TEXT NOT NULL,
            task TEXT NOT NULL,
            status TEXT NOT NULL,
            duration_ms INTEGER,
            output TEXT,
            version TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS artifacts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            project_path TEXT NOT NULL,
            filename TEXT NOT NULL,
            version TEXT,
            file_path TEXT NOT NULL,
            size_bytes INTEGER,
            status TEXT NOT NULL DEFAULT 'ready',
            build_time TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            message TEXT NOT NULL,
            tool_id TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS release_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_path TEXT NOT NULL UNIQUE,
            content TEXT NOT NULL,
            version TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS version_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_path TEXT NOT NULL,
            version TEXT NOT NULL,
            developer TEXT,
            build_number TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS deploy_history (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            server_name TEXT NOT NULL,
            artifact_name TEXT NOT NULL,
            target_folder TEXT NOT NULL,
            status TEXT NOT NULL,
            message TEXT,
            created_at TEXT NOT NULL
        );
        ",
    )?;
    migrate_schema(conn)?;
    Ok(())
}

fn migrate_schema(conn: &Connection) -> Result<()> {
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(build_history)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .collect();

    if !columns.contains(&"version".to_string()) {
        conn.execute("ALTER TABLE build_history ADD COLUMN version TEXT", [])?;
    }

    Ok(())
}
