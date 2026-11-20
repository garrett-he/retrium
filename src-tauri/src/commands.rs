//! Tauri commands: orchestration only. Validation lives in `manifest`,
//! `launch` and `library`; this layer resolves paths, talks to the database and
//! turns errors into strings the UI can show.

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::config::{self, Config};
use crate::db::Db;
use crate::library::{self, Layout};
use crate::{cart_from, AppState, Cart, CartInfo, CartProcess, SetupState};

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

struct Session {
    #[allow(dead_code)]
    config: Config,
    layout: Layout,
}

fn session(state: &State<'_, AppState>) -> Result<Session, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?.clone();
    let layout = Layout::new(&config.library);
    Ok(Session { config, layout })
}

/// Open the index on demand and hand it to `f`. Reopened after a library change.
fn with_db<T>(state: &State<'_, AppState>, f: impl FnOnce(&Db) -> Result<T, String>) -> Result<T, String> {
    let library = state.config.lock().map_err(|e| e.to_string())?.library.clone();
    std::fs::create_dir_all(&library).map_err(|e| e.to_string())?;

    let mut guard = state.db.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        *guard = Some(Db::open(Path::new(&library))?);
    }
    f(guard.as_ref().expect("database just opened"))
}

/// Keep `retrium.db` aligned with `carts/`: add rows for archives that appeared
/// (manually copied in, or a rebuilt database) and drop rows for archives that
/// are gone. Cheap: one directory listing plus one `SELECT id`.
fn sync_index(layout: &Layout, db: &Db) -> Result<(), String> {
    layout.ensure()?;
    let archives = layout.archive_ids()?;
    let rows = db.ids()?;

    for id in archives.iter().filter(|id| !rows.contains(id)) {
        if let Some(record) = library::load_record(layout, id)? {
            db.upsert(&record)?;
        }
    }
    for id in rows.iter().filter(|id| !archives.contains(id)) {
        db.delete(id)?;
    }
    Ok(())
}


#[allow(dead_code)]
fn is_running(state: &State<'_, AppState>, id: &str) -> Result<bool, String> {
    Ok(state.processes.lock().map_err(|e| e.to_string())?.contains_key(id))
}

fn running_process(state: &State<'_, AppState>, id: &str) -> Result<Option<CartProcess>, String> {
    Ok(state
        .processes
        .lock()
        .map_err(|e| e.to_string())?
        .get(id)
        .map(|handle| CartProcess {
            pid: handle.pid,
            cart_id: handle.cart_id.clone(),
            target_id: handle.target_id.clone(),
            target_label: handle.target_label.clone(),
            started_at: handle.started_at.to_rfc3339(),
        }))
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

/// Every cart in the library, read from the index.
#[tauri::command]
pub fn discover_carts(state: State<'_, AppState>) -> Result<Vec<Cart>, String> {
    let session = session(&state)?;
    with_db(&state, |db| {
        sync_index(&session.layout, db)?;
        let records = db.list()?;
        let mut carts = Vec::with_capacity(records.len());
        for record in records {
            let summary = db.get_summary(&record.manifest.cart.id)?;
            carts.push(cart_from(&record, &session.layout, summary));
        }
        Ok(carts)
    })
}

/// Open `installed/<id>/` in the system file manager.
#[tauri::command]
pub fn open_cart_folder(id: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let session = session(&state)?;
    let path = session.layout.install_dir(&id);
    if !path.is_dir() {
        return Err(format!("cart is not installed: {id}"));
    }
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Persist edited metadata. Only the index changes; the archive keeps its hash
/// until the next export, so the cart is reported as dirty in the meantime.
#[tauri::command]
pub fn update_cart_info(
    id: String,
    info: CartInfo,
    author: Option<crate::manifest::Author>,
    state: State<'_, AppState>,
) -> Result<Cart, String> {
    if info.name.trim().is_empty() {
        return Err("Cart name is required".to_string());
    }
    if let Some(author) = &author {
        if author.name.trim().is_empty() {
            return Err("Author name must not be empty".to_string());
        }
    }

    let session = session(&state)?;
    with_db(&state, |db| {
        let mut record = db.get(&id)?.ok_or_else(|| format!("cart not found: {id}"))?;

        record.manifest.program = crate::manifest::ProgramBlock::from(&info);
        record.manifest.cart.author = author;
        db.upsert(&record)?;

        let summary = db.get_summary(&id)?;
        Ok(cart_from(&record, &session.layout, summary))
    })
}

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_cart_process(id: String, state: State<'_, AppState>) -> Result<Option<CartProcess>, String> {
    running_process(&state, &id)
}

#[tauri::command]
pub fn list_cart_processes(state: State<'_, AppState>) -> Result<Vec<CartProcess>, String> {
    let processes = state.processes.lock().map_err(|e| e.to_string())?;
    Ok(processes
        .values()
        .map(|handle| CartProcess {
            pid: handle.pid,
            cart_id: handle.cart_id.clone(),
            target_id: handle.target_id.clone(),
            target_label: handle.target_label.clone(),
            started_at: handle.started_at.to_rfc3339(),
        })
        .collect())
}

#[tauri::command]
pub fn stop_all_carts(state: State<'_, AppState>) -> Result<usize, String> {
    let mut processes = state.processes.lock().map_err(|e| e.to_string())?;
    let stopped = processes.len();
    for (_, handle) in processes.drain() {
        let _ = handle.kill_tx.send(());
    }
    Ok(stopped)
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DosboxProbe {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub exists: bool,
}

#[tauri::command]
pub fn get_dosbox_path(state: State<'_, AppState>) -> Result<DosboxProbe, String> {
    let path = state.config.lock().map_err(|e| e.to_string())?.dosbox.path.clone();
    let file = Path::new(&path);
    Ok(DosboxProbe {
        exists: file.is_file(),
        version: config::probe_version(file),
        path,
    })
}

/// Store the single DOSBox path. Returns the detected version, if any.
#[tauri::command]
pub fn set_dosbox_path(path: String, state: State<'_, AppState>) -> Result<DosboxProbe, String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err("DOSBox executable path is required".to_string());
    }
    let file = Path::new(&path);
    if !file.is_file() {
        return Err(format!("DOSBox executable not found: {path}"));
    }

    let version = config::probe_version(file);
    let mut config = state.config.lock().map_err(|e| e.to_string())?.clone();
    config.dosbox.path = path.clone();
    config.save()?;
    *state.config.lock().map_err(|e| e.to_string())? = config;

    Ok(DosboxProbe {
        path,
        version,
        exists: true,
    })
}

/// Probe a path without saving it, so the settings page can preview the result.
#[tauri::command]
pub fn probe_dosbox_path(path: String) -> Result<DosboxProbe, String> {
    let file = Path::new(&path);
    Ok(DosboxProbe {
        exists: file.is_file(),
        version: config::probe_version(file),
        path,
    })
}

#[tauri::command]
pub fn get_setup_state(state: State<'_, AppState>) -> Result<SetupState, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(SetupState {
        configured: state.configured.load(Ordering::SeqCst),
        library: config.library.clone(),
        dosbox: config.dosbox.path.clone(),
    })
}

#[tauri::command]
pub fn complete_setup(library: String, dosbox: String, state: State<'_, AppState>) -> Result<(), String> {
    let library = library.trim().to_string();
    let dosbox = dosbox.trim().to_string();

    if library.is_empty() {
        return Err("Library directory is required".to_string());
    }
    if !Path::new(&dosbox).is_file() {
        return Err(format!("DOSBox executable not found: {dosbox}"));
    }
    std::fs::create_dir_all(&library).map_err(|e| format!("Failed to create library directory: {e}"))?;

    let config = Config {
        library: library.clone(),
        dosbox: config::DosboxConfig { path: dosbox },
    };
    config.save()?;

    *state.config.lock().map_err(|e| e.to_string())? = config;
    *state.db.lock().map_err(|e| e.to_string())? = None;
    state.configured.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn set_library_directory(library: String, state: State<'_, AppState>) -> Result<(), String> {
    let library = library.trim().to_string();
    if library.is_empty() {
        return Err("Library directory is required".to_string());
    }
    std::fs::create_dir_all(&library).map_err(|e| format!("Failed to create library directory: {e}"))?;

    let mut config = state.config.lock().map_err(|e| e.to_string())?.clone();
    config.library = library;
    config.save()?;
    *state.config.lock().map_err(|e| e.to_string())? = config;
    // The index belongs to the old library.
    *state.db.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
pub async fn pick_library_directory(app: AppHandle) -> Result<Option<String>, String> {
    Ok(app
        .dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn pick_dosbox_executable(app: AppHandle) -> Result<Option<String>, String> {
    let dialog = app.dialog().file();
    #[cfg(target_os = "windows")]
    let dialog = dialog.add_filter("DOSBox", &["exe"]);
    Ok(dialog
        .blocking_pick_file()
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().to_string()))
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

fn pending_message(decision: crate::ImportDecision, analyzed: &crate::import::Analyzed) -> String {
    match decision {
        crate::ImportDecision::Upgrade => format!(
            "revision {} is newer than the installed one ({})",
            analyzed.revision(),
            analyzed.existing_revision.unwrap_or_default()
        ),
        crate::ImportDecision::Downgrade => format!(
            "revision {} is older than the installed one ({})",
            analyzed.revision(),
            analyzed.existing_revision.unwrap_or_default()
        ),
        crate::ImportDecision::Conflict => "same revision, different content".to_string(),
        crate::ImportDecision::Duplicate => format!(
            "identical content is already in the library as {}",
            analyzed.duplicate_of.clone().unwrap_or_default()
        ),
    }
}

/// Pick carts and import whatever needs no decision. Anything ambiguous comes
/// back in `pending` and is applied later by `resolve_import`.
#[tauri::command]
pub async fn add_carts(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<crate::ImportReport, String> {
    let files = app
        .dialog()
        .file()
        .add_filter("Retrium Carts", &["cart"])
        .blocking_pick_files();

    let files = match files {
        Some(files) => files,
        None => {
            return Ok(crate::ImportReport {
                imported: Vec::new(),
                skipped: Vec::new(),
                pending: Vec::new(),
            })
        }
    };

    let session = session(&state)?;
    let mut report = crate::ImportReport {
        imported: Vec::new(),
        skipped: Vec::new(),
        pending: Vec::new(),
    };

    with_db(&state, |db| {
        for file in files {
            let path = file.into_path().map_err(|e| e.to_string())?;
            let archive = path.to_string_lossy().to_string();

            let analyzed = match crate::import::analyze(db, &path) {
                Ok(analyzed) => analyzed,
                Err(reason) => {
                    report.skipped.push(crate::ImportNote {
                        archive,
                        id: String::new(),
                        reason,
                    });
                    continue;
                }
            };

            match analyzed.outcome {
                crate::import::Outcome::New => {
                    match crate::import::import_new(&session.layout, db, &analyzed) {
                        Ok(cart) => report.imported.push(cart),
                        Err(reason) => report.skipped.push(crate::ImportNote {
                            archive,
                            id: analyzed.id().to_string(),
                            reason,
                        }),
                    }
                }
                crate::import::Outcome::Idempotent => report.skipped.push(crate::ImportNote {
                    archive,
                    id: analyzed.id().to_string(),
                    reason: "already imported".to_string(),
                }),
                crate::import::Outcome::Pending(decision) => {
                    let message = pending_message(decision, &analyzed);
                    report.pending.push(crate::PendingImport {
                        archive,
                        id: analyzed.id().to_string(),
                        name: analyzed.name().to_string(),
                        decision,
                        message,
                        existing_revision: analyzed.existing_revision,
                        incoming_revision: analyzed.revision(),
                    });
                }
            }
        }
        Ok(())
    })?;

    Ok(report)
}

/// Apply or skip one item that `add_carts` left pending.
#[tauri::command]
pub fn resolve_import(
    archive: String,
    action: crate::ImportAction,
    state: State<'_, AppState>,
) -> Result<Option<Cart>, String> {
    if action == crate::ImportAction::Skip {
        return Ok(None);
    }

    let path = PathBuf::from(&archive);
    let session = session(&state)?;

    with_db(&state, |db| {
        let analyzed = crate::import::analyze(db, &path)?;
        let id = analyzed.id().to_string();

        if is_running(&state, &id)? {
            return Err(format!("cart is running: {id}"));
        }

        let cart = match analyzed.outcome {
            crate::import::Outcome::Idempotent => {
                let record = db.get(&id)?.ok_or_else(|| format!("cart not found: {id}"))?;
                let summary = db.get_summary(&id)?;
                Some(cart_from(&record, &session.layout, summary))
            }
            crate::import::Outcome::New => {
                Some(crate::import::import_new(&session.layout, db, &analyzed)?)
            }
            crate::import::Outcome::Pending(_) => {
                Some(crate::import::replace(&session.layout, db, &analyzed)?)
            }
        };
        Ok(cart)
    })
}
