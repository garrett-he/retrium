use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::Duration;

use notify::Watcher;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::config::Config;
use crate::{AppState, Cart, CartInfo, CartProcess, CartRunOptions, CartSummary, DosboxVersions, ProcessHandle};

// ---------------------------------------------------------------------------
// Discovery helpers
// ---------------------------------------------------------------------------

fn discover_carts_inner(config: &Config) -> Vec<Cart> {
    let carts_dir = PathBuf::from(&config.library).join("carts");
    let mut carts = Vec::new();

    let entries = match std::fs::read_dir(&carts_dir) {
        Ok(entries) => entries,
        Err(_) => return carts,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let id = match path.file_name().and_then(|n| n.to_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };

        let dir = path.to_string_lossy().to_string();
        let info = load_cart_info(&path, &id);
        let cover = {
            let cover_path = path.join(".retrium").join("cover.png");
            if cover_path.exists() {
                Some(cover_path.to_string_lossy().to_string())
            } else {
                None
            }
        };

        carts.push(Cart { id, dir, info, cover });
    }

    carts
}

fn load_cart_info(cart_dir: &Path, fallback_name: &str) -> CartInfo {
    let retrium_dir = cart_dir.join(".retrium");

    // Older Tauri builds wrote `info.json`; `metadata.json` is the canonical name.
    for file in ["metadata.json", "info.json"] {
        let info_path = retrium_dir.join(file);
        if let Ok(content) = std::fs::read_to_string(&info_path) {
            if let Ok(mut info) = serde_json::from_str::<CartInfo>(&content) {
                if info.name.is_empty() {
                    info.name = fallback_name.to_string();
                }
                return info;
            }
        }
    }

    CartInfo {
        name: fallback_name.to_string(),
        ..CartInfo::default()
    }
}

// ---------------------------------------------------------------------------
// Summary helpers
// ---------------------------------------------------------------------------

fn summary_path(library: &str, cart_id: &str) -> PathBuf {
    PathBuf::from(library).join("summaries").join(format!("{cart_id}.json"))
}

fn load_summary(path: &Path) -> Option<CartSummary> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn save_summary(path: &Path, summary: &CartSummary) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(summary).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

/// Recursively copy the contents of `src` into `dst`, preserving relative paths.
fn copy_dir_contents(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in walkdir::WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let rel = path.strip_prefix(src).map_err(|e| e.to_string())?;
        if rel.as_os_str().is_empty() {
            continue;
        }

        let dest = dst.join(rel);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::copy(path, &dest).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Create a cart (zip-format archive) of `src_dir` at `dest`.
fn create_zip(src_dir: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for entry in walkdir::WalkDir::new(src_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let rel = path.strip_prefix(src_dir).map_err(|e| e.to_string())?;
        if rel.as_os_str().is_empty() {
            continue;
        }

        let name = rel.to_str().ok_or_else(|| "Invalid UTF-8 in path".to_string())?;

        if entry.file_type().is_dir() {
            zip.add_directory(name, options).map_err(|e| e.to_string())?;
        } else if entry.file_type().is_file() {
            zip.start_file(name, options).map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
        }
    }

    let mut file = zip.finish().map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Extract a cart at `zip_path` into `dest_dir`.
fn extract_zip(zip_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match entry.enclosed_name() {
            Some(p) => dest_dir.join(p),
            None => continue,
        };

        if entry.is_dir() {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// Derive a cart directory name from an archive file name.
fn archive_stem(path: &Path) -> String {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("cart");

    for ext in [".tar.gz", ".tgz", ".cart", ".zip"] {
        if let Some(stripped) = name.strip_suffix(ext) {
            return stripped.to_string();
        }
    }

    path.file_stem().and_then(|s| s.to_str()).unwrap_or(name).to_string()
}

// ---------------------------------------------------------------------------
// File watcher
// ---------------------------------------------------------------------------

/// Watch `cart_dir` for created/modified files and mirror them into `states_dir`,
/// skipping the `.retrium` metadata folder. Runs until `stop_rx` receives a signal.
fn run_watcher(cart_dir: PathBuf, states_dir: PathBuf, stop_rx: std::sync::mpsc::Receiver<()>) {
    let (tx, rx) = std::sync::mpsc::channel::<notify::Result<notify::Event>>();

    let watcher = match notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let _ = tx.send(res);
    }) {
        Ok(mut watcher) => {
            if let Err(e) = watcher.watch(&cart_dir, notify::RecursiveMode::Recursive) {
                eprintln!("retrium: watch error: {e}");
            }
            watcher
        }
        Err(e) => {
            eprintln!("retrium: watcher init error: {e}");
            return;
        }
    };

    loop {
        match rx.recv_timeout(Duration::from_millis(250)) {
            Ok(Ok(event)) => {
                if matches!(event.kind, notify::EventKind::Create(_) | notify::EventKind::Modify(_)) {
                    for path in &event.paths {
                        if !path.is_file() {
                            continue;
                        }
                        let rel = match path.strip_prefix(&cart_dir) {
                            Ok(rel) => rel,
                            Err(_) => continue,
                        };
                        if rel
                            .components()
                            .any(|c| c.as_os_str() == std::ffi::OsStr::new(".retrium"))
                        {
                            continue;
                        }
                        let dest = states_dir.join(rel);
                        if let Some(parent) = dest.parent() {
                            let _ = std::fs::create_dir_all(parent);
                        }
                        let _ = std::fs::copy(path, &dest);
                    }
                }
            }
            Ok(Err(e)) => {
                eprintln!("retrium: watch event error: {e}");
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                if stop_rx.try_recv().is_ok() {
                    break;
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    drop(watcher);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// List all carts found under `{library}/carts`.
#[tauri::command]
pub fn discover_carts(state: State<'_, AppState>) -> Result<Vec<Cart>, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?.clone();
    Ok(discover_carts_inner(&config))
}

/// Launch a cart in DOSBox, restoring saved states and tracking the process.
#[tauri::command]
pub async fn run_cart(
    options: CartRunOptions,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CartProcess, String> {
    let cart = options.cart.clone();
    let cart_id = cart.id.clone();

    // Refuse to launch a cart that is already running.
    {
        let processes = state.processes.lock().map_err(|e| e.to_string())?;
        if processes.contains_key(&cart_id) {
            return Err(format!("Cart '{cart_id}' is already running"));
        }
    }

    let config = state.config.lock().map_err(|e| e.to_string())?.clone();
    let library = config.library.clone();
    let cart_dir = PathBuf::from(&cart.dir);

    // Restore previously saved states into the cart directory.
    let states_dir = PathBuf::from(&library).join("states").join(&cart_id);
    if states_dir.exists() {
        copy_dir_contents(&states_dir, &cart_dir)?;
    }

    // Resolve the DOSBox executable for the requested version.
    let requested = options.dosbox_version.as_str();
    let resolved = config
        .version(requested)
        .or_else(|| config.default_version())
        .ok_or_else(|| "No DOSBox version configured".to_string())?;
    let dosbox_path = resolved.path.clone();
    let dosbox_name = resolved.name.clone();

    let conf_path = cart_dir.join(".retrium").join("dosbox.conf");
    let mut cmd = tokio::process::Command::new(&dosbox_path);
    cmd.current_dir(&cart_dir);
    if conf_path.exists() {
        cmd.arg("-conf").arg(&conf_path);
    }

    let child = cmd.spawn().map_err(|e| e.to_string())?;
    let pid = child.id().ok_or_else(|| "Failed to get process id".to_string())?;
    let started_at = chrono::Utc::now();

    let (kill_tx, kill_rx) = tokio::sync::oneshot::channel::<()>();

    {
        let mut processes = state.processes.lock().map_err(|e| e.to_string())?;
        processes.insert(
            cart_id.clone(),
            ProcessHandle {
                pid,
                cart: cart.clone(),
                dosbox_version: dosbox_name.clone(),
                started_at,
                kill_tx,
            },
        );
    }

    let app_clone = app.clone();
    let cart_id_for_task = cart_id.clone();
    let library_for_task = library.clone();
    let cart_dir_for_task = cart_dir.clone();
    let states_dir_for_task = PathBuf::from(&library_for_task).join("states").join(&cart_id_for_task);

    tokio::spawn(async move {
        let mut child = child;
        let start = std::time::Instant::now();

        let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
        let watcher_task = tokio::task::spawn_blocking(move || {
            run_watcher(cart_dir_for_task, states_dir_for_task, stop_rx);
        });

        // Wait for the process to exit, or kill it when requested.
        let _exit_status = tokio::select! {
            result = child.wait() => result,
            _ = kill_rx => {
                let _ = child.kill().await;
                child.wait().await
            }
        };

        // Stop the file watcher before updating the summary.
        let _ = stop_tx.send(());
        let _ = watcher_task.await;

        let elapsed = start.elapsed().as_secs() as i64;

        let path = summary_path(&library_for_task, &cart_id_for_task);
        let mut summary = load_summary(&path).unwrap_or_default();
        summary.runs += 1;
        summary.elapsed += elapsed;
        summary.last_run = chrono::Utc::now().to_rfc3339();
        if let Err(e) = save_summary(&path, &summary) {
            eprintln!("retrium: failed to save summary: {e}");
        }

        if let Some(app_state) = app_clone.try_state::<AppState>() {
            if let Ok(mut processes) = app_state.processes.lock() {
                processes.remove(&cart_id_for_task);
            }
        }
    });

    Ok(CartProcess {
        pid,
        cart,
        dosbox_version: dosbox_name,
        started_at: started_at.to_rfc3339(),
    })
}

/// Stop a running cart by signalling its DOSBox process to be killed.
#[tauri::command]
pub fn stop_cart(cart: Cart, state: State<'_, AppState>) -> Result<(), String> {
    let handle = {
        let mut processes = state.processes.lock().map_err(|e| e.to_string())?;
        processes.remove(&cart.id)
    };

    match handle {
        Some(handle) => {
            let _ = handle.kill_tx.send(());
            Ok(())
        }
        None => Err(format!("Cart '{}' is not running", cart.id)),
    }
}

/// Open the cart directory in the system file manager.
#[tauri::command]
pub fn open_cart_folder(cart: Cart, app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_path(cart.dir.clone(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Permanently delete a cart directory from disk.
#[tauri::command]
pub fn delete_cart(cart: Cart) -> Result<(), String> {
    let path = PathBuf::from(&cart.dir);
    if path.exists() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Export a cart directory as a .cart archive chosen via a save dialog.
#[tauri::command]
pub async fn archive_cart(cart: Cart, app: AppHandle) -> Result<(), String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("Retrium Carts", &["cart"])
        .add_filter("All Files", &["*"])
        .set_file_name(format!("{}.cart", cart.id))
        .blocking_save_file();

    let dest = match file_path {
        Some(path) => path.into_path().map_err(|e| e.to_string())?,
        None => return Ok(()),
    };

    create_zip(&PathBuf::from(&cart.dir), &dest)?;
    Ok(())
}

/// Extract an archive into `carts_dir` and return the resulting cart id.
///
/// When the archive contains exactly one top-level directory, that directory
/// becomes the cart directory. Otherwise the archive file name is used.
fn import_archive(archive: &Path, carts_dir: &Path) -> Result<String, String> {
    let temp = std::env::temp_dir().join(format!(
        "retrium-import-{}-{}",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    std::fs::create_dir_all(&temp).map_err(|e| e.to_string())?;

    let result = (|| {
        extract_zip(archive, &temp)?;

        let entries: Vec<PathBuf> = std::fs::read_dir(&temp)
            .map_err(|e| e.to_string())?
            .flatten()
            .map(|entry| entry.path())
            .collect();

        let single_dir = match entries.as_slice() {
            [entry] if entry.is_dir() => Some(entry.clone()),
            _ => None,
        };

        let (id, source) = match &single_dir {
            Some(dir) => {
                let id = dir
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(str::to_string)
                    .ok_or_else(|| "Invalid UTF-8 in archive folder name".to_string())?;
                (id, dir.clone())
            }
            None => (archive_stem(archive), temp.clone()),
        };

        let dest = carts_dir.join(&id);
        std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        copy_dir_contents(&source, &dest)?;

        Ok(id)
    })();

    let _ = std::fs::remove_dir_all(&temp);
    result
}

/// Import carts chosen via an open dialog into the library.
#[tauri::command]
pub async fn add_carts(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<Cart>, String> {
    let files = app
        .dialog()
        .file()
        .add_filter("Retrium Carts", &["cart"])
        .add_filter("Legacy Archives", &["zip", "tar.gz", "tgz"])
        .add_filter("All Files", &["*"])
        .blocking_pick_files();

    let files = match files {
        Some(files) => files,
        None => return Ok(Vec::new()),
    };

    let config = state.config.lock().map_err(|e| e.to_string())?.clone();
    let carts_dir = PathBuf::from(&config.library).join("carts");
    std::fs::create_dir_all(&carts_dir).map_err(|e| e.to_string())?;

    let mut new_ids = Vec::new();
    for file in files {
        let path = file.into_path().map_err(|e| e.to_string())?;
        new_ids.push(import_archive(&path, &carts_dir)?);
    }

    let carts = discover_carts_inner(&config);
    let result = carts.into_iter().filter(|p| new_ids.contains(&p.id)).collect();

    Ok(result)
}

/// Return the running process for a cart, if any.
#[tauri::command]
pub fn get_cart_process(cart: Cart, state: State<'_, AppState>) -> Result<Option<CartProcess>, String> {
    let processes = state.processes.lock().map_err(|e| e.to_string())?;
    Ok(processes.get(&cart.id).map(|handle| CartProcess {
        pid: handle.pid,
        cart: handle.cart.clone(),
        dosbox_version: handle.dosbox_version.clone(),
        started_at: handle.started_at.to_rfc3339(),
    }))
}

/// List every currently running DOSBox process.
#[tauri::command]
pub fn list_cart_processes(state: State<'_, AppState>) -> Result<Vec<CartProcess>, String> {
    let processes = state.processes.lock().map_err(|e| e.to_string())?;
    Ok(processes
        .values()
        .map(|handle| CartProcess {
            pid: handle.pid,
            cart: handle.cart.clone(),
            dosbox_version: handle.dosbox_version.clone(),
            started_at: handle.started_at.to_rfc3339(),
        })
        .collect())
}

/// Stop every running DOSBox process, returning how many were stopped.
#[tauri::command]
pub fn stop_all_carts(state: State<'_, AppState>) -> Result<usize, String> {
    let mut processes = state.processes.lock().map_err(|e| e.to_string())?;
    let stopped = processes.len();
    for (_, handle) in processes.drain() {
        let _ = handle.kill_tx.send(());
    }
    Ok(stopped)
}

/// Persist edited cart metadata to `.retrium/metadata.json` on disk.
#[tauri::command]
pub fn update_cart_info(cart: Cart, info: CartInfo) -> Result<Cart, String> {
    if info.name.trim().is_empty() {
        return Err("Cart name is required".to_string());
    }

    let dir = PathBuf::from(&cart.dir);
    let retrium_dir = dir.join(".retrium");
    std::fs::create_dir_all(&retrium_dir).map_err(|e| e.to_string())?;
    let content = serde_json::to_string_pretty(&info).map_err(|e| e.to_string())?;
    std::fs::write(retrium_dir.join("metadata.json"), content).map_err(|e| e.to_string())?;

    Ok(Cart { info, ..cart })
}

/// Return the run summary for a cart, if any.
#[tauri::command]
pub fn get_cart_summary(cart: Cart, state: State<'_, AppState>) -> Result<Option<CartSummary>, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?.clone();
    let path = summary_path(&config.library, &cart.id);
    Ok(load_summary(&path))
}

/// Return run summaries for every cart that has one, keyed by cart id.
#[tauri::command]
pub fn get_cart_summaries(state: State<'_, AppState>) -> Result<HashMap<String, CartSummary>, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?.clone();
    let dir = PathBuf::from(&config.library).join("summaries");
    let mut summaries = HashMap::new();

    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Some(id) = path.file_stem().and_then(|s| s.to_str()) {
                if let Some(summary) = load_summary(&path) {
                    summaries.insert(id.to_string(), summary);
                }
            }
        }
    }

    Ok(summaries)
}

/// Return the configured DOSBox versions together with the default one.
#[tauri::command]
pub fn get_dosbox_versions(state: State<'_, AppState>) -> Result<DosboxVersions, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?.clone();
    Ok(DosboxVersions {
        default: config.dosbox.default.clone(),
        versions: config.dosbox.versions.clone(),
    })
}

/// Add a DOSBox executable to the configured versions.
#[tauri::command]
pub fn add_dosbox_version(name: String, path: String, state: State<'_, AppState>) -> Result<(), String> {
    let name = name.trim().to_string();
    let path = path.trim().to_string();

    if name.is_empty() {
        return Err("Version name is required".to_string());
    }
    if path.is_empty() {
        return Err("DOSBox executable path is required".to_string());
    }
    if !Path::new(&path).is_file() {
        return Err(format!("DOSBox executable not found: {path}"));
    }

    let mut config = state.config.lock().map_err(|e| e.to_string())?.clone();
    if config.version(&name).is_some() {
        return Err(format!("DOSBox version '{name}' already exists"));
    }

    config.dosbox.versions.push(crate::DosboxVersion { name, path });
    config.save()?;
    *state.config.lock().map_err(|e| e.to_string())? = config;
    Ok(())
}

/// Remove a non-default DOSBox version from the configuration.
#[tauri::command]
pub fn remove_dosbox_version(name: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?.clone();

    if config.dosbox.default == name {
        return Err("Cannot remove the default DOSBox version".to_string());
    }
    let before = config.dosbox.versions.len();
    config.dosbox.versions.retain(|v| v.name != name);
    if config.dosbox.versions.len() == before {
        return Err(format!("DOSBox version '{name}' not found"));
    }

    config.save()?;
    *state.config.lock().map_err(|e| e.to_string())? = config;
    Ok(())
}

/// Set which configured DOSBox version the main Run button uses.
#[tauri::command]
pub fn set_default_dosbox_version(name: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?.clone();
    if config.version(&name).is_none() {
        return Err(format!("DOSBox version '{name}' not found"));
    }

    config.dosbox.default = name;
    config.save()?;
    *state.config.lock().map_err(|e| e.to_string())? = config;
    Ok(())
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupState {
    pub configured: bool,
    pub library: String,
    pub dosbox: String,
}

/// Return whether the app is configured, plus the values to prefill on first run.
#[tauri::command]
pub fn get_setup_state(state: State<'_, AppState>) -> Result<SetupState, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    let dosbox = config.default_version().map(|v| v.path.clone()).unwrap_or_default();

    Ok(SetupState {
        configured: state.configured.load(Ordering::SeqCst),
        library: config.library.clone(),
        dosbox,
    })
}

/// Persist the first-run configuration and mark the app as configured.
#[tauri::command]
pub fn complete_setup(library: String, dosbox: String, state: State<'_, AppState>) -> Result<(), String> {
    let library = library.trim().to_string();
    let dosbox = dosbox.trim().to_string();

    if library.is_empty() {
        return Err("Library directory is required".to_string());
    }
    if dosbox.is_empty() {
        return Err("DOSBox executable is required".to_string());
    }
    if !Path::new(&dosbox).is_file() {
        return Err(format!("DOSBox executable not found: {dosbox}"));
    }

    std::fs::create_dir_all(&library).map_err(|e| format!("Failed to create library directory: {e}"))?;

    let config = Config {
        library,
        dosbox: crate::config::DosboxConfig {
            default: "DOSBox".to_string(),
            versions: vec![crate::DosboxVersion {
                name: "DOSBox".to_string(),
                path: dosbox,
            }],
        },
    };
    config.save()?;

    *state.config.lock().map_err(|e| e.to_string())? = config;
    state.configured.store(true, Ordering::SeqCst);
    Ok(())
}

/// Change the library directory after the initial setup.
#[tauri::command]
pub fn set_library_directory(library: String, state: State<'_, AppState>) -> Result<(), String> {
    let library = library.trim().to_string();
    if library.is_empty() {
        return Err("Library directory is required".to_string());
    }

    std::fs::create_dir_all(&library).map_err(|e| format!("Failed to create library directory: {e}"))?;

    let mut config = state.config.lock().map_err(|e| e.to_string())?.clone();
    config.library = library.clone();
    config.save()?;
    *state.config.lock().map_err(|e| e.to_string())? = config;
    Ok(())
}

/// Pick the library directory with the native folder dialog.
#[tauri::command]
pub async fn pick_library_directory(app: AppHandle) -> Result<Option<String>, String> {
    Ok(app
        .dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().to_string()))
}

/// Pick the DOSBox executable with the native file dialog.
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

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "retrium-test-{tag}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn import_uses_single_top_level_folder_as_cart_dir() {
        let root = scratch_dir("single-folder");
        let source = root.join("A").join("B");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("xxx.exe"), b"binary").unwrap();

        let archive = root.join("A.cart");
        create_zip(&root.join("A"), &archive).unwrap();

        let carts = root.join("carts");
        std::fs::create_dir_all(&carts).unwrap();
        let id = import_archive(&archive, &carts).unwrap();

        assert_eq!(id, "B");
        assert!(carts.join("B").join("xxx.exe").is_file());
        assert!(!carts.join("A").exists());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn import_falls_back_to_archive_name_for_root_entries() {
        let root = scratch_dir("root-entries");
        let source = root.join("files");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("xxx.exe"), b"binary").unwrap();
        std::fs::write(source.join("readme.txt"), b"text").unwrap();

        let archive = root.join("Game.cart");
        create_zip(&source, &archive).unwrap();

        let carts = root.join("carts");
        std::fs::create_dir_all(&carts).unwrap();
        let id = import_archive(&archive, &carts).unwrap();

        assert_eq!(id, "Game");
        assert!(carts.join("Game").join("xxx.exe").is_file());
        assert!(carts.join("Game").join("readme.txt").is_file());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn loads_metadata_from_metadata_json() {
        let root = scratch_dir("metadata");
        let retrium = root.join(".retrium");
        std::fs::create_dir_all(&retrium).unwrap();
        std::fs::write(
            retrium.join("metadata.json"),
            r#"{"name":"Doom","release":1993,"series":null,"tags":[]}"#,
        )
        .unwrap();

        let info = load_cart_info(&root, "fallback");

        assert_eq!(info.name, "Doom");
        assert_eq!(info.release, Some(1993));
        assert_eq!(info.tags, Some(Vec::new()));

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn loads_metadata_from_legacy_info_json() {
        let root = scratch_dir("legacy-info");
        let retrium = root.join(".retrium");
        std::fs::create_dir_all(&retrium).unwrap();
        std::fs::write(retrium.join("info.json"), r#"{"name":"Wolfenstein 3D"}"#).unwrap();

        let info = load_cart_info(&root, "fallback");

        assert_eq!(info.name, "Wolfenstein 3D");

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn falls_back_to_folder_name_without_metadata() {
        let root = scratch_dir("no-metadata");
        std::fs::create_dir_all(&root).unwrap();

        let info = load_cart_info(&root, "GAME");

        assert_eq!(info.name, "GAME");

        std::fs::remove_dir_all(&root).unwrap();
    }
}
