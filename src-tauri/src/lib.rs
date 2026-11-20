pub mod commands;
pub mod config;
pub mod db;
pub mod error;
pub mod hash;
pub mod import;
pub mod launch;
pub mod library;
pub mod manifest;
pub mod state;

use std::collections::{BTreeMap, HashMap};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::db::Db;
use crate::manifest::{Dos, ProgramBlock, Tool};

pub const APP_NAME: &str = "Retrium";
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// `cart.tool`, describing whoever produced the current revision.
pub fn current_tool() -> Tool {
    Tool {
        app: APP_NAME.to_string(),
        version: APP_VERSION.to_string(),
        host: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
    }
}

/// A cart as the UI sees it: the manifest plus index-side facts (cover, dirty,
/// run summary) that do not live in the archive.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cart {
    pub id: String,
    pub revision: i64,
    pub info: CartInfo,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<manifest::Author>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    /// `None` when it cannot be known (no commit cache, an export in progress).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dirty: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<CartSummary>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CartInfo {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub developer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publisher: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub series: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub players: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dos: Option<Dos>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_ids: Option<BTreeMap<String, String>>,
}

impl From<&ProgramBlock> for CartInfo {
    fn from(program: &ProgramBlock) -> Self {
        CartInfo {
            name: program.name.clone(),
            language: program.language.clone(),
            release: program.release,
            category: program.category.clone(),
            developer: program.developer.clone(),
            publisher: program.publisher.clone(),
            series: program.series.clone(),
            tags: program.tags.clone(),
            players: program.players,
            platform: program.platform.clone(),
            dos: program.dos.clone(),
            external_ids: program.external_ids.clone(),
        }
    }
}

impl From<&CartInfo> for ProgramBlock {
    fn from(info: &CartInfo) -> Self {
        ProgramBlock {
            name: info.name.clone(),
            language: info.language.clone(),
            release: info.release,
            category: info.category.clone(),
            developer: info.developer.clone(),
            publisher: info.publisher.clone(),
            series: info.series.clone(),
            tags: info.tags.clone(),
            players: info.players,
            platform: info.platform.clone(),
            dos: info.dos.clone(),
            external_ids: info.external_ids.clone(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CartProcess {
    pub pid: u32,
    pub cart_id: String,
    pub target_id: String,
    pub target_label: String,
    /// RFC 3339 timestamp of when the process was launched.
    pub started_at: String,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CartSummary {
    /// RFC 3339 timestamp of the last run.
    pub last_run: String,
    pub runs: i64,
    /// Total elapsed time in seconds.
    pub elapsed: i64,
}

/// What the Run button needs: the targets the author declared, nothing else.
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchInfo {
    pub targets: Vec<TargetInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_target: Option<String>,
    /// Set when `launch.json` cannot be read. The button is disabled instead of
    /// guessing a target.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetInfo {
    pub id: String,
    pub label: String,
    pub executable: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportAction {
    /// Do what `PendingImport::decision` describes, or import a new cart.
    Apply,
    /// Leave the library untouched.
    Skip,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub imported: Vec<Cart>,
    pub skipped: Vec<ImportNote>,
    /// Items that need a human decision before anything touches the disk.
    pub pending: Vec<PendingImport>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportNote {
    pub archive: String,
    pub id: String,
    pub reason: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingImport {
    pub archive: String,
    pub id: String,
    pub name: String,
    pub decision: ImportDecision,
    pub message: String,
    pub existing_revision: Option<i64>,
    pub incoming_revision: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportDecision {
    /// Same id, higher revision: offer an upgrade.
    Upgrade,
    /// Same id and revision but different content: refuse unless replaced.
    Conflict,
    /// Same id, lower revision: refuse unless explicitly downgraded.
    Downgrade,
    /// Same content under a different id.
    Duplicate,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPreview {
    pub dirty: bool,
    pub revision: i64,
    pub next_revision: i64,
    pub package_hash: String,
    /// Hash of what the installed copy would produce right now.
    pub current_hash: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupState {
    pub configured: bool,
    pub library: String,
    pub dosbox: String,
}

/// Build the UI-facing `Cart` from an index row plus the local facts that are
/// not in the archive (cover file, commit cache, run summary).
pub fn cart_from(
    record: &db::CartRecord,
    layout: &library::Layout,
    summary: Option<db::Summary>,
) -> Cart {
    let id = &record.manifest.cart.id;
    let cover = layout.install_dir(id).join("Resources/cover.png");
    let has_cover = cover.is_file();

    Cart {
        id: id.clone(),
        revision: record.manifest.cart.revision,
        info: CartInfo::from(&record.manifest.program),
        author: record.manifest.cart.author.clone(),
        created_at: record.manifest.cart.created_at.clone(),
        cover: has_cover.then(|| cover.to_string_lossy().to_string()),
        dirty: library::read_commit(layout, id)
            .map(|commit| commit.package_hash != record.package_hash),
        summary: summary.map(|s| CartSummary {
            last_run: s.last_run,
            runs: s.runs,
            elapsed: s.elapsed,
        }),
    }
}

/// A running DOSBox process tracked by Retrium.
pub struct ProcessHandle {
    pub pid: u32,
    pub cart_id: String,
    pub target_id: String,
    pub target_label: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    /// Sending a value kills the spawned process and ends the watcher task.
    pub kill_tx: tokio::sync::oneshot::Sender<()>,
}

pub struct AppState {
    pub config: Mutex<config::Config>,
    /// Whether a usable config file existed at startup.
    pub configured: AtomicBool,
    pub processes: Mutex<HashMap<String, ProcessHandle>>,
    /// Opened lazily and dropped when the library changes.
    pub db: Mutex<Option<Db>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/window-icon.png")) {
                    let _ = window.set_icon(icon);
                }
            }
            let (config, configured) = match config::Config::load() {
                Some(config) => (config, true),
                None => (config::Config::default(), false),
            };
            app.manage(AppState {
                config: Mutex::new(config),
                configured: AtomicBool::new(configured),
                processes: Mutex::new(HashMap::new()),
                db: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::discover_carts,
            commands::add_carts,
            commands::resolve_import,
            commands::stop_all_carts,
            commands::list_cart_processes,
            commands::get_cart_process,
            commands::open_cart_folder,
            commands::update_cart_info,
            commands::get_dosbox_path,
            commands::set_dosbox_path,
            commands::probe_dosbox_path,
            commands::get_setup_state,
            commands::complete_setup,
            commands::set_library_directory,
            commands::pick_library_directory,
            commands::pick_dosbox_executable,
        ])
        .run(tauri::generate_context!())
        .expect("error while running retrium application");
}
