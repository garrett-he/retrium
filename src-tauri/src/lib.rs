pub mod commands;
pub mod config;

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::Manager;

pub type DosboxVersionConfig = std::collections::HashMap<String, String>;

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

#[derive(Clone, Serialize, Deserialize)]
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

impl Default for ProgramInfo {
    fn default() -> Self {
        Self {
            name: String::new(),
            language: None,
            release: None,
            category: None,
            developer: None,
            publisher: None,
            series: None,
            tags: None,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ProgramProcess {
    pub pid: u32,
    pub program: Program,
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

/// A running DOSBox process tracked by Retrium.
pub struct ProcessHandle {
    pub pid: u32,
    pub program: Program,
    /// Sending a value kills the spawned process and ends the watcher task.
    pub kill_tx: tokio::sync::oneshot::Sender<()>,
}

pub struct AppState {
    pub config: Mutex<config::Config>,
    pub processes: Mutex<HashMap<String, ProcessHandle>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config = config::Config::load();
            app.manage(AppState {
                config: Mutex::new(config),
                processes: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::discover_programs,
            commands::run_program,
            commands::stop_program,
            commands::open_program_folder,
            commands::delete_program,
            commands::archive_program,
            commands::add_programs,
            commands::get_program_process,
            commands::get_program_summary,
            commands::get_dosbox_versions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running retrium application");
}
