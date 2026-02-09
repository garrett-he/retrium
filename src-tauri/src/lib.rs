pub mod commands;
pub mod config;

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::Manager;

pub use config::DosboxVersion;

#[derive(Clone, Serialize, Deserialize)]
pub struct Program {
    /// Directory basename used as the unique identifier.
    pub id: String,
    /// Absolute path to the program directory.
    pub dir: String,
    pub info: ProgramInfo,
    /// Absolute path to `cover.png` when present.
    pub cover: Option<String>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct ProgramInfo {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub developer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publisher: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub series: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
}

/// A running DOSBox process tracked by Retrium.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgramProcess {
    pub pid: u32,
    pub program: Program,
    pub dosbox_version: String,
    /// RFC 3339 timestamp of when the process was launched.
    pub started_at: String,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgramSummary {
    /// ISO 8601 (RFC 3339) date string of the last run.
    pub last_run: String,
    pub runs: i64,
    /// Total elapsed time in seconds.
    pub elapsed: i64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ProgramRunOptions {
    pub program: Program,
    #[serde(rename = "dosboxVersion")]
    pub dosbox_version: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DosboxVersions {
    pub default: String,
    pub versions: Vec<DosboxVersion>,
}

/// A running DOSBox process tracked by Retrium.
pub struct ProcessHandle {
    pub pid: u32,
    pub program: Program,
    pub dosbox_version: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    /// Sending a value kills the spawned process and ends the watcher task.
    pub kill_tx: tokio::sync::oneshot::Sender<()>,
}

pub struct AppState {
    pub config: Mutex<config::Config>,
    /// Whether the config file existed and was valid at startup.
    pub configured: AtomicBool,
    pub processes: Mutex<HashMap<String, ProcessHandle>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let (config, configured) = match config::Config::load() {
                Some(config) => (config, true),
                None => (config::Config::default(), false),
            };
            app.manage(AppState {
                config: Mutex::new(config),
                configured: AtomicBool::new(configured),
                processes: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::discover_programs,
            commands::run_program,
            commands::stop_program,
            commands::stop_all_programs,
            commands::list_program_processes,
            commands::open_program_folder,
            commands::delete_program,
            commands::archive_program,
            commands::add_programs,
            commands::update_program_info,
            commands::get_program_process,
            commands::get_program_summary,
            commands::get_program_summaries,
            commands::get_dosbox_versions,
            commands::add_dosbox_version,
            commands::remove_dosbox_version,
            commands::set_default_dosbox_version,
            commands::get_setup_state,
            commands::complete_setup,
            commands::set_library_directory,
            commands::pick_library_directory,
            commands::pick_dosbox_executable,
        ])
        .run(tauri::generate_context!())
        .expect("error while running retrium application");
}
