//! Preparing a launch: make sure the working copy exists, turn `launch.json`
//! into `Runtime/dosbox.conf`, and hand the caller everything needed to spawn.
//!
//! Nothing here starts a process, so the whole path is testable: pass a DOSBox
//! executable that does not exist and the conf is still generated correctly.

use std::path::{Path, PathBuf};

use crate::config;
use crate::launch::{ConfOptions, FileIndex, Launch};
use crate::library::{self, Layout};
use crate::state::{self, Baseline, BASELINE_FILE, RUNNING_FILE};

pub struct Prepared {
    pub dosbox: PathBuf,
    pub program_dir: PathBuf,
    pub conf_path: PathBuf,
    pub target_id: String,
    pub target_label: String,
    /// Baseline taken after recovery, ready to be written before spawn.
    pub baseline: Baseline,
}

/// Read `launch.json`, regenerate the conf, and recover from a previous crash.
///
/// Order matters: recovery comes before the baseline snapshot, so a leftover
/// run is folded into `State/` instead of being compared twice.
pub fn prepare(
    layout: &Layout,
    id: &str,
    target: Option<&str>,
    dosbox: &Path,
    app_version: &str,
    scale: Option<u8>,
) -> Result<Prepared, String> {
    let installed = layout.install_dir(id);
    if !installed.is_dir() {
        return Err(format!("cart is not installed: {id}"));
    }

    let runtime = layout.runtime_dir(id);
    let program_dir = layout.program_dir(id);
    let state_dir = layout.state_dir(id);

    // A cart whose working copy is missing is restored the same way a reset
    // does it: extract, then put the save layer back on top.
    if !program_dir.is_dir() {
        let archive = layout.archive(id);
        if !archive.is_file() {
            return Err(format!("archive is missing: {}", archive.display()));
        }
        library::extract(&archive, layout, id)?;
        state::apply(&state_dir, &installed)?;
    }

    // A `running` marker means the previous session never cleaned up.
    let running = runtime.join(RUNNING_FILE);
    if running.exists() {
        if let Some(baseline) = Baseline::load(&runtime.join(BASELINE_FILE)) {
            state::diff(&program_dir, &state_dir, &baseline)?;
        }
        let _ = std::fs::remove_file(&running);
    }

    let launch_path = installed.join(library::LAUNCH_ENTRY);
    let bytes = std::fs::read(&launch_path).map_err(|e| format!("{}: {e}", launch_path.display()))?;
    let launch = Launch::from_bytes(&bytes).map_err(|e| e.to_string())?;

    let index = FileIndex::from_dir(&installed)?;
    let version = config::probe_version(dosbox);

    let rendered = launch
        .render_conf(
            &index,
            &ConfOptions {
                installed_dir: &installed,
                target_id: target,
                dosbox_version: version.as_deref(),
                app_version,
                scale,
            },
        )
        .map_err(|e| e.to_string())?;

    std::fs::create_dir_all(&runtime).map_err(|e| e.to_string())?;
    let conf_path = runtime.join("dosbox.conf");
    std::fs::write(&conf_path, rendered.text).map_err(|e| e.to_string())?;

    let baseline = Baseline::snapshot(&program_dir)?;

    Ok(Prepared {
        dosbox: dosbox.to_path_buf(),
        program_dir,
        conf_path,
        target_id: rendered.target_id,
        target_label: rendered.label,
        baseline,
    })
}

/// Write the baseline, drop the run marker and return the marker path.
pub fn begin(layout: &Layout, id: &str, baseline: &Baseline) -> Result<PathBuf, String> {
    let runtime = layout.runtime_dir(id);
    std::fs::create_dir_all(&runtime).map_err(|e| e.to_string())?;
    baseline.save(&runtime.join(BASELINE_FILE))?;
    let running = runtime.join(RUNNING_FILE);
    std::fs::write(&running, b"").map_err(|e| e.to_string())?;
    Ok(running)
}

/// Fold what the program wrote back into `State/` and clear the run marker.
pub fn finish(layout: &Layout, id: &str) -> Result<Vec<String>, String> {
    let runtime = layout.runtime_dir(id);
    let program_dir = layout.program_dir(id);
    let state_dir = layout.state_dir(id);

    let changed = match Baseline::load(&runtime.join(BASELINE_FILE)) {
        Some(baseline) => state::diff(&program_dir, &state_dir, &baseline)?,
        // Without a baseline there is nothing trustworthy to compare against;
        // keep the previous `State/` rather than guessing.
        None => Vec::new(),
    };

    let _ = std::fs::remove_file(runtime.join(RUNNING_FILE));
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{CartBlock, Manifest, ProgramBlock, Tool};

    const ID: &str = "019ae4c1-2f3b-7c4d-8e9f-0a1b2c3d4e5f";
    const LAUNCH: &str = r#"{
        "version": 1,
        "default": "game",
        "targets": [
            { "id": "game",  "label": "主游戏",   "executable": "GAME.EXE", "profile": "high" },
            { "id": "setup", "label": "声音设置", "executable": "SETUP.EXE" }
        ],
        "profiles": { "high": { "memsize": 16, "sound": ["sb16"] } }
    }"#;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "retrium-run-{tag}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: PathBuf, contents: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, contents).unwrap();
    }

    fn installed_cart(tag: &str) -> (PathBuf, Layout) {
        let root = scratch(tag);
        let layout = Layout::new(&root);
        layout.ensure().unwrap();
        write(layout.program_dir(ID).join("GAME.EXE"), "x");
        write(layout.program_dir(ID).join("SETUP.EXE"), "x");
        write(layout.install_dir(ID).join(library::LAUNCH_ENTRY), LAUNCH);

        let manifest = Manifest {
            version: 1,
            cart: CartBlock {
                id: ID.to_string(),
                revision: 1,
                author: None,
                tool: Tool {
                    app: "Retrium".to_string(),
                    version: "0.3.0".to_string(),
                    host: "test".to_string(),
                },
                created_at: "2026-11-20T13:00:00Z".to_string(),
            },
            program: ProgramBlock {
                name: "Test".to_string(),
                ..ProgramBlock::default()
            },
        };
        let (_, hash) = library::commit(
            &layout,
            ID,
            &manifest,
            1,
            &manifest.cart.tool,
            &manifest.cart.created_at,
        )
        .unwrap();
        library::write_commit(
            &layout,
            ID,
            &library::CommitInfo {
                revision: 1,
                package_hash: hash,
                manifest_version: 1,
            },
        )
        .unwrap();
        (root, layout)
    }

    #[test]
    fn generates_the_conf_and_keeps_the_default_target() {
        let (root, layout) = installed_cart("prepare");
        let prepared = prepare(&layout, ID, None, Path::new("/nonexistent/dosbox"), "0.3.0", None).unwrap();

        assert_eq!(prepared.target_id, "game");
        assert_eq!(prepared.target_label, "主游戏");
        let conf = std::fs::read_to_string(&prepared.conf_path).unwrap();
        assert!(conf.contains("\nmemsize=16"));
        assert!(conf.contains("sbtype=sb16"));
        assert!(conf.contains("target=game"));
        assert!(conf.contains("# DOSBox: unknown"));
        assert!(conf.contains("MOUNT C "));
        assert!(conf.contains("GAME.EXE"));

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_named_target_gets_its_own_conf() {
        let (root, layout) = installed_cart("prepare-target");
        let prepared = prepare(
            &layout,
            ID,
            Some("setup"),
            Path::new("/nonexistent/dosbox"),
            "0.3.0",
            None,
        )
        .unwrap();
        assert_eq!(prepared.target_id, "setup");
        let conf = std::fs::read_to_string(&prepared.conf_path).unwrap();
        assert!(!conf.contains("\nmemsize=16"));
        assert!(conf.contains("SETUP.EXE"));

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn restores_a_missing_program_from_the_archive() {
        let (root, layout) = installed_cart("prepare-restore");
        std::fs::remove_dir_all(layout.program_dir(ID)).unwrap();
        write(layout.state_dir(ID).join("Program/SAVE.DAT"), "save");

        let prepared = prepare(&layout, ID, None, Path::new("/nonexistent/dosbox"), "0.3.0", None).unwrap();
        assert!(prepared.program_dir.join("GAME.EXE").is_file());
        assert!(
            prepared.program_dir.join("SAVE.DAT").is_file(),
            "the save layer must be re-applied"
        );

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_leftover_running_marker_is_folded_into_state() {
        let (root, layout) = installed_cart("prepare-crash");
        let baseline = Baseline::snapshot(&layout.program_dir(ID)).unwrap();
        begin(&layout, ID, &baseline).unwrap();

        // The program wrote a save and the process died without cleanup.
        write(layout.program_dir(ID).join("CRASH.SAV"), "save");

        prepare(&layout, ID, None, Path::new("/nonexistent/dosbox"), "0.3.0", None).unwrap();
        assert!(layout.state_dir(ID).join("Program/CRASH.SAV").is_file());
        assert!(!layout.runtime_dir(ID).join(RUNNING_FILE).exists());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn finish_records_changes_and_clears_the_marker() {
        let (root, layout) = installed_cart("finish");
        let baseline = Baseline::snapshot(&layout.program_dir(ID)).unwrap();
        begin(&layout, ID, &baseline).unwrap();

        write(layout.program_dir(ID).join("NEW.SAV"), "save");
        let changed = finish(&layout, ID).unwrap();

        assert!(changed.contains(&"NEW.SAV".to_string()));
        assert!(layout.state_dir(ID).join("Program/NEW.SAV").is_file());
        assert!(!layout.runtime_dir(ID).join(RUNNING_FILE).exists());

        std::fs::remove_dir_all(&root).unwrap();
    }
}
