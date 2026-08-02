mod auth;
mod commands;
mod db;

use commands::auth::{
    change_password, login_user, logout_user, register_user, update_avatar, validate_session,
};
use commands::deploy::{
    backup_server_folder, copy_file, create_deployment_profile_id, create_server_id,
    delete_deployment_profile, delete_path, delete_server, deploy_artifact, get_deploy_history,
    get_deployment_profiles, get_server_status, get_servers, list_directory, read_log_tail,
    read_text_file, rename_path, save_deployment_profile, save_server, send_server_command,
    start_server, stop_server, write_text_file, ServerProcesses,
};
use commands::inspector::{ai_chat, analyze_offline, analyze_with_ai, read_file_content};
use commands::pterodactyl::{
    pterodactyl_create_backup, pterodactyl_deploy_artifact, pterodactyl_get_console_credentials,
    pterodactyl_get_status, pterodactyl_list_files, pterodactyl_list_servers,
    pterodactyl_power_action, pterodactyl_read_file, pterodactyl_send_command,
    pterodactyl_write_file,
};
use commands::publisher::{
    cancel_build, delete_artifact, detect_installed_ides, detect_modules, detect_project,
    find_jar_files, get_artifacts, get_build_history, get_last_build_info, get_recent_workspaces,
    get_release_notes, get_version_history, open_folder, open_in_ide, rename_artifact,
    reveal_in_explorer, run_gradle_task, save_recent_workspace, save_release_notes,
    send_discord_webhook, update_project_version, BuildManager,
};
use commands::settings::{
    get_activity, get_recent_tools, get_settings, log_activity, record_tool_usage, set_setting,
    set_settings_batch,
};
use db::DbState;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let db = DbState::new(app.handle()).expect("Failed to initialize database");
            app.manage(db);
            app.manage(Arc::new(ServerProcesses::new()));
            app.manage(BuildManager::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            register_user,
            login_user,
            validate_session,
            logout_user,
            change_password,
            update_avatar,
            get_settings,
            set_setting,
            set_settings_batch,
            log_activity,
            get_activity,
            record_tool_usage,
            get_recent_tools,
            detect_project,
            detect_modules,
            run_gradle_task,
            cancel_build,
            get_build_history,
            get_last_build_info,
            get_artifacts,
            delete_artifact,
            rename_artifact,
            save_recent_workspace,
            get_recent_workspaces,
            send_discord_webhook,
            find_jar_files,
            open_in_ide,
            detect_installed_ides,
            reveal_in_explorer,
            open_folder,
            update_project_version,
            get_version_history,
            save_release_notes,
            get_release_notes,
            save_deployment_profile,
            get_deployment_profiles,
            delete_deployment_profile,
            save_server,
            get_servers,
            delete_server,
            list_directory,
            delete_path,
            rename_path,
            copy_file,
            read_text_file,
            write_text_file,
            deploy_artifact,
            get_deploy_history,
            start_server,
            stop_server,
            get_server_status,
            send_server_command,
            pterodactyl_list_servers,
            pterodactyl_get_status,
            pterodactyl_power_action,
            pterodactyl_list_files,
            pterodactyl_read_file,
            pterodactyl_write_file,
            pterodactyl_deploy_artifact,
            pterodactyl_send_command,
            pterodactyl_create_backup,
            pterodactyl_get_console_credentials,
            read_log_tail,
            create_deployment_profile_id,
            create_server_id,
            backup_server_folder,
            analyze_offline,
            analyze_with_ai,
            ai_chat,
            read_file_content,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
