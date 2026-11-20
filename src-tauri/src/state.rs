//! The save-file differ.
//!
//! `installed/<id>/Program/` is the working copy; whatever a program writes
//! there must not end up in the immutable archive. `Runtime/State/` records the
//! difference against the cart, mirroring the cart namespace:
//!
//! ```text
//! Runtime/State/Program/SAVE01.DAT   ->  overrides Program/SAVE01.DAT
//! ```
//!
//! The difference is computed once, at exit, from a `stat` snapshot taken at
//! launch. No watcher thread: it would have to deal with file locks, case
//! folding and dropped events, and all it buys is a live "save updated" badge.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const STATE_DIR: &str = "State";
pub const BASELINE_FILE: &str = "baseline.json";
pub const RUNNING_FILE: &str = "running";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileStat {
    pub size: u64,
    pub mtime_ns: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Baseline {
    /// Keyed by path relative to `Program/`.
    pub entries: BTreeMap<String, FileStat>,
}

impl Baseline {
    /// `stat` every file under `Program/`. Contents are never read.
    pub fn snapshot(program: &Path) -> Result<Baseline, String> {
        let mut entries = BTreeMap::new();
        for entry in walkdir::WalkDir::new(program).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let rel = relative(program, entry.path())?;
            entries.insert(rel, stat_of(entry.path())?);
        }
        Ok(Baseline { entries })
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(path, json).map_err(|e| e.to_string())
    }

    pub fn load(path: &Path) -> Option<Baseline> {
        let text = std::fs::read_to_string(path).ok()?;
        serde_json::from_str(&text).ok()
    }
}

fn stat_of(path: &Path) -> Result<FileStat, String> {
    let metadata = std::fs::metadata(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mtime_ns = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos() as i64)
        .unwrap_or(0);
    Ok(FileStat {
        size: metadata.len(),
        mtime_ns,
    })
}

fn relative(root: &Path, path: &Path) -> Result<String, String> {
    Ok(path
        .strip_prefix(root)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/"))
}

/// Copy `State/**` over `installed/**`. Called before a launch and after a
/// re-extract, so the player's saves survive both.
pub fn apply(state: &Path, installed: &Path) -> Result<(), String> {
    if !state.is_dir() {
        return Ok(());
    }
    for entry in walkdir::WalkDir::new(state).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = relative(state, entry.path())?;
        let destination = installed.join(&rel);
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::copy(entry.path(), &destination).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Compare `Program/` against the baseline and update `State/` in place.
///
/// - new or changed file   -> copy into `State/Program/...`
/// - file gone from Program -> remove from `State/`
/// - file only in the cart  -> nothing to do; a reset restores it
///
/// Returns the affected paths relative to `Program/`, for logging and tests.
pub fn diff(program: &Path, state: &Path, baseline: &Baseline) -> Result<Vec<String>, String> {
    let state_program = state.join("Program");
    std::fs::create_dir_all(&state_program).map_err(|e| e.to_string())?;

    let mut present = BTreeSet::new();
    let mut touched = Vec::new();

    for entry in walkdir::WalkDir::new(program).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = relative(program, entry.path())?;
        present.insert(rel.clone());

        let changed = match baseline.entries.get(&rel) {
            Some(known) => known != &stat_of(entry.path())?,
            None => true,
        };
        if changed {
            let destination = state_program.join(&rel);
            if let Some(parent) = destination.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::copy(entry.path(), &destination).map_err(|e| e.to_string())?;
            touched.push(rel);
        }
    }

    for entry in walkdir::WalkDir::new(&state_program).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = relative(&state_program, entry.path())?;
        if !present.contains(&rel) {
            std::fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
            touched.push(format!("-{rel}"));
        }
    }

    prune_empty_dirs(&state_program);
    Ok(touched)
}

fn prune_empty_dirs(root: &Path) {
    let mut dirs: Vec<PathBuf> = walkdir::WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir())
        .map(|e| e.path().to_path_buf())
        .collect();
    // Deepest first, so a parent can become empty after its children are gone.
    dirs.sort_by_key(|path| std::cmp::Reverse(path.components().count()));
    for dir in dirs {
        if dir == root {
            continue;
        }
        let empty = std::fs::read_dir(&dir)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false);
        if empty {
            let _ = std::fs::remove_dir(&dir);
        }
    }
}

/// Remove the whole difference layer, along with the run markers.
pub fn clear(state: &Path) -> Result<(), String> {
    if state.exists() {
        std::fs::remove_dir_all(state).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "retrium-state-{tag}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, contents).unwrap();
    }

    #[test]
    fn records_new_and_changed_files_and_drops_deleted_ones() {
        let root = scratch("diff");
        let program = root.join("installed").join("Program");
        let state = root.join("installed").join("Runtime").join("State");

        write(&program.join("GAME.EXE"), "original");
        write(&program.join("DATA/LEVEL1.DAT"), "level");
        write(&program.join("WILL-BE-DELETED.DAT"), "bye");
        write(&program.join("UNCHANGED.DAT"), "same");

        let baseline = Baseline::snapshot(&program).unwrap();

        // A run: modify one file, add one, delete one, leave one alone.
        write(&program.join("GAME.EXE"), "patched");
        write(&program.join("SAVE01.DAT"), "save");
        std::fs::remove_file(program.join("WILL-BE-DELETED.DAT")).unwrap();
        // Enough to change size, which the stat snapshot will notice.
        write(&program.join("DATA/LEVEL1.DAT"), "level-updated");

        let touched = diff(&program, &state, &baseline).unwrap();
        assert!(state.join("Program/GAME.EXE").is_file());
        assert!(state.join("Program/SAVE01.DAT").is_file());
        assert!(touched.contains(&"SAVE01.DAT".to_string()));

        // Files the program never touched must not be duplicated into State.
        assert!(!state.join("Program/UNCHANGED.DAT").exists());
        assert!(!state.join("Program/WILL-BE-DELETED.DAT").exists());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn removes_state_entries_whose_program_file_vanished() {
        let root = scratch("vanish");
        let program = root.join("Program");
        let state = root.join("State");
        write(&program.join("SAVE01.DAT"), "one");
        let baseline = Baseline::snapshot(&program).unwrap();

        // Pretend a previous run recorded a save that no longer exists.
        write(&state.join("Program/SAVE01.DAT"), "one");
        write(&state.join("Program/STALE.DAT"), "old");
        std::fs::remove_file(program.join("SAVE01.DAT")).unwrap();

        diff(&program, &state, &baseline).unwrap();
        assert!(!state.join("Program/STALE.DAT").exists());
        assert!(!state.join("Program/SAVE01.DAT").exists());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn keeps_state_that_was_unchanged_during_the_run() {
        let root = scratch("keep");
        let program = root.join("Program");
        let state = root.join("State");
        write(&program.join("SAVE01.DAT"), "applied");
        // State already holds a save that was applied before the snapshot.
        write(&state.join("Program/SAVE01.DAT"), "applied");

        let baseline = Baseline::snapshot(&program).unwrap();
        diff(&program, &state, &baseline).unwrap();
        assert!(state.join("Program/SAVE01.DAT").is_file());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn apply_overlays_state_onto_installed() {
        let root = scratch("apply");
        let installed = root.join("installed");
        let state = installed.join("Runtime/State");
        write(&installed.join("Program/GAME.EXE"), "original");
        write(&state.join("Program/GAME.EXE"), "patched");
        write(&state.join("Program/NEW/SAVE.DAT"), "save");

        apply(&state, &installed).unwrap();
        assert_eq!(
            std::fs::read_to_string(installed.join("Program/GAME.EXE")).unwrap(),
            "patched"
        );
        assert!(installed.join("Program/NEW/SAVE.DAT").is_file());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn baseline_roundtrips_through_disk() {
        let root = scratch("baseline");
        let program = root.join("Program");
        write(&program.join("A.DAT"), "aaa");

        let baseline = Baseline::snapshot(&program).unwrap();
        let path = root.join("baseline.json");
        baseline.save(&path).unwrap();
        let loaded = Baseline::load(&path).unwrap();
        assert_eq!(loaded.entries, baseline.entries);

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn clear_removes_everything() {
        let root = scratch("clear");
        let state = root.join("State");
        write(&state.join("Program/A.DAT"), "x");
        clear(&state).unwrap();
        assert!(!state.exists());
        std::fs::remove_dir_all(&root).unwrap();
    }
}
