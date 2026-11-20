//! Import: decide what an archive means, then apply it.
//!
//! Split in two phases because the design demands that ambiguous cases never
//! resolve themselves: an upgrade or a conflict must be chosen by a human, so
//! `analyze` returns a decision without touching the disk and `apply` performs
//! exactly that decision.

use std::path::{Path, PathBuf};

use crate::db::{CartRecord, Db};
use crate::library::{self, Inspection, Layout};
use crate::{cart_from, Cart, ImportDecision};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// No cart with this id in the library.
    New,
    /// Same id, same revision, same hash: nothing to do.
    Idempotent,
    /// Needs an explicit decision.
    Pending(ImportDecision),
}

#[derive(Debug)]
pub struct Analyzed {
    pub path: PathBuf,
    pub inspection: Inspection,
    pub outcome: Outcome,
    pub existing_revision: Option<i64>,
    pub duplicate_of: Option<String>,
}

impl Analyzed {
    pub fn id(&self) -> &str {
        &self.inspection.manifest.cart.id
    }

    pub fn revision(&self) -> i64 {
        self.inspection.manifest.cart.revision
    }

    pub fn name(&self) -> &str {
        &self.inspection.manifest.program.name
    }
}

/// Inspect an archive and compare it with the index. Read-only.
pub fn analyze(db: &Db, path: &Path) -> Result<Analyzed, String> {
    let inspection = library::inspect(path).map_err(|e| e.to_string())?;
    let id = inspection.manifest.cart.id.clone();
    let revision = inspection.manifest.cart.revision;
    let existing = db.get(&id)?;

    let outcome = match &existing {
        None => Outcome::New,
        Some(record) => {
            let current = record.manifest.cart.revision;
            if revision == current && record.package_hash == inspection.hash {
                Outcome::Idempotent
            } else if revision > current {
                Outcome::Pending(ImportDecision::Upgrade)
            } else if revision < current {
                Outcome::Pending(ImportDecision::Downgrade)
            } else {
                Outcome::Pending(ImportDecision::Conflict)
            }
        }
    };

    // Defensive: `manifest.json` is part of the hash, so two different ids can
    // never carry the same hash. Kept because it costs one indexed query and
    // would catch a future format where identity leaves the manifest.
    let duplicate_of = match outcome {
        Outcome::New => db.find_by_hash(&inspection.hash, &id)?,
        _ => None,
    };
    let outcome = match &duplicate_of {
        Some(_) => Outcome::Pending(ImportDecision::Duplicate),
        None => outcome,
    };

    Ok(Analyzed {
        path: path.to_path_buf(),
        existing_revision: existing.map(|record| record.manifest.cart.revision),
        inspection,
        outcome,
        duplicate_of,
    })
}

fn cleanup(layout: &Layout, id: &str) {
    let _ = std::fs::remove_file(layout.archive(id).with_extension("cart.tmp"));
    let _ = std::fs::remove_file(layout.archive(id));
    let _ = std::fs::remove_dir_all(layout.install_dir(id));
}

fn index(layout: &Layout, db: &Db, analyzed: &Analyzed) -> Result<Cart, String> {
    let record = CartRecord {
        manifest: analyzed.inspection.manifest.clone(),
        package_hash: analyzed.inspection.hash.clone(),
        raw_path: format!("carts/{}.cart", analyzed.id()),
    };

    if let Err(error) = db.upsert(&record) {
        cleanup(layout, analyzed.id());
        return Err(error);
    }
    library::write_commit(
        layout,
        analyzed.id(),
        &library::CommitInfo {
            revision: record.manifest.cart.revision,
            package_hash: record.package_hash.clone(),
            manifest_version: record.manifest.version,
        },
    )?;

    let summary = db.get_summary(analyzed.id())?;
    Ok(cart_from(&record, layout, summary))
}

/// Import a cart that is not in the library yet.
pub fn import_new(layout: &Layout, db: &Db, analyzed: &Analyzed) -> Result<Cart, String> {
    let id = analyzed.id();
    let destination = layout.archive(id);

    if destination.exists() || layout.install_dir(id).exists() {
        return Err(format!("cart already exists on disk: {id}"));
    }

    layout.ensure()?;
    let temp = destination.with_extension("cart.tmp");
    std::fs::copy(&analyzed.path, &temp).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, &destination).map_err(|e| e.to_string())?;

    if let Err(error) = library::extract(&destination, layout, id) {
        cleanup(layout, id);
        return Err(error);
    }

    index(layout, db, analyzed)
}

/// Overwrite an existing cart. `Runtime/State/` survives: the saves belong to
/// the player, `Program/` belongs to the cart.
pub fn replace(layout: &Layout, db: &Db, analyzed: &Analyzed) -> Result<Cart, String> {
    let id = analyzed.id();
    let destination = layout.archive(id);

    layout.ensure()?;
    if destination.exists() {
        let temp = destination.with_extension("cart.tmp");
        std::fs::copy(&analyzed.path, &temp).map_err(|e| e.to_string())?;
        library::replace_archive(&temp, &destination)?;
    } else {
        std::fs::copy(&analyzed.path, &destination).map_err(|e| e.to_string())?;
    }

    // From here the archive is valid, so a failure is recoverable with "repair".
    let installed = layout.install_dir(id);
    for sub in ["Program", "Config", "Resources"] {
        let path = installed.join(sub);
        if path.exists() {
            std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
        }
    }
    library::extract(&destination, layout, id)?;
    crate::state::apply(&layout.state_dir(id), &installed)?;

    index(layout, db, analyzed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::Layout;
    use crate::manifest::{CartBlock, Manifest, ProgramBlock, Tool};

    const LAUNCH: &str = r#"{
        "version": 1,
        "targets": [{ "id": "game", "label": "Game", "executable": "GAME.EXE" }]
    }"#;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "retrium-import-{tag}-{}-{}",
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

    /// Build a cart archive in `root`, the way the app would export it.
    fn build_cart(root: &Path, id: &str, revision: i64, files: &[(&str, &str)]) -> PathBuf {
        let layout = Layout::new(root);
        layout.ensure().unwrap();
        let installed = layout.install_dir(id);
        for (name, contents) in files {
            write(installed.join(name), contents);
        }
        write(installed.join("Config/launch.json"), LAUNCH);

        let manifest = Manifest {
            version: 1,
            cart: CartBlock {
                id: id.to_string(),
                revision,
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
            id,
            &manifest,
            revision,
            &manifest.cart.tool,
            &manifest.cart.created_at,
        )
        .unwrap();

        // Keep the commit cache honest: the source library now thinks it is clean.
        library::write_commit(
            &layout,
            id,
            &library::CommitInfo {
                revision,
                package_hash: hash,
                manifest_version: 1,
            },
        )
        .unwrap();

        layout.archive(id)
    }

    fn target_library() -> (PathBuf, Layout, Db) {
        let root = scratch("target");
        let layout = Layout::new(&root);
        layout.ensure().unwrap();
        let db = Db::open(&root).unwrap();
        (root, layout, db)
    }

    #[test]
    fn imports_a_new_cart_and_indexes_it() {
        let source = scratch("source-new");
        let archive = build_cart(&source, "019ae4c1-2f3b-7c4d-8e9f-0a1b2c3d4e5f", 1, &[("Program/GAME.EXE", "x")]);

        let (root, layout, db) = target_library();
        let analyzed = analyze(&db, &archive).unwrap();
        assert_eq!(analyzed.outcome, Outcome::New);

        let cart = import_new(&layout, &db, &analyzed).unwrap();
        assert_eq!(cart.revision, 1);
        assert_eq!(cart.dirty, Some(false));
        assert!(layout.archive(&cart.id).is_file());
        assert!(layout.program_dir(&cart.id).join("GAME.EXE").is_file());
        assert!(layout.runtime_dir(&cart.id).join(library::COMMIT_FILE).is_file());

        // Second time round it is idempotent, not an error.
        let again = analyze(&db, &archive).unwrap();
        assert_eq!(again.outcome, Outcome::Idempotent);

        std::fs::remove_dir_all(&source).unwrap();
        // Windows refuses to delete a directory while SQLite holds the file.
        drop(db);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn higher_revision_is_offered_as_an_upgrade_and_keeps_saves() {
        let source = scratch("source-upgrade");
        let id = "019ae4c1-2f3b-7c4d-8e9f-0a1b2c3d4e5f";
        let v1 = build_cart(&source, id, 1, &[("Program/GAME.EXE", "v1")]);

        let (root, layout, db) = target_library();
        let analyzed = analyze(&db, &v1).unwrap();
        import_new(&layout, &db, &analyzed).unwrap();

        // A save produced by a run.
        let save = layout.state_dir(id).join("Program/SAVE01.DAT");
        write(save.clone(), "precious");

        // Rebuild the source as revision 2 with different content.
        let source2 = scratch("source-upgrade-2");
        let v2 = build_cart(&source2, id, 2, &[("Program/GAME.EXE", "v2")]);

        let analyzed = analyze(&db, &v2).unwrap();
        assert_eq!(analyzed.outcome, Outcome::Pending(ImportDecision::Upgrade));

        let cart = replace(&layout, &db, &analyzed).unwrap();
        assert_eq!(cart.revision, 2);
        assert_eq!(
            std::fs::read_to_string(layout.program_dir(id).join("GAME.EXE")).unwrap(),
            "v2"
        );
        assert!(
            save.is_file(),
            "an upgrade must not throw the player's saves away"
        );

        std::fs::remove_dir_all(&source).unwrap();
        std::fs::remove_dir_all(&source2).unwrap();
        // Windows refuses to delete a directory while SQLite holds the file.
        drop(db);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn same_revision_with_other_content_is_a_conflict() {
        let source = scratch("source-conflict");
        let id = "019ae4c1-2f3b-7c4d-8e9f-0a1b2c3d4e5f";
        let v1 = build_cart(&source, id, 1, &[("Program/GAME.EXE", "one")]);

        let (root, layout, db) = target_library();
        import_new(&layout, &db, &analyze(&db, &v1).unwrap()).unwrap();

        let other = scratch("source-conflict-2");
        let clash = build_cart(&other, id, 1, &[("Program/GAME.EXE", "two")]);
        let analyzed = analyze(&db, &clash).unwrap();
        assert_eq!(analyzed.outcome, Outcome::Pending(ImportDecision::Conflict));

        std::fs::remove_dir_all(&source).unwrap();
        std::fs::remove_dir_all(&other).unwrap();
        // Windows refuses to delete a directory while SQLite holds the file.
        drop(db);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn lower_revision_is_a_downgrade() {
        let source = scratch("source-downgrade");
        let id = "019ae4c1-2f3b-7c4d-8e9f-0a1b2c3d4e5f";
        let v3 = build_cart(&source, id, 3, &[("Program/GAME.EXE", "v3")]);

        let (root, layout, db) = target_library();
        import_new(&layout, &db, &analyze(&db, &v3).unwrap()).unwrap();

        let older = scratch("source-downgrade-2");
        let v2 = build_cart(&older, id, 2, &[("Program/GAME.EXE", "v2")]);
        assert_eq!(
            analyze(&db, &v2).unwrap().outcome,
            Outcome::Pending(ImportDecision::Downgrade)
        );

        std::fs::remove_dir_all(&source).unwrap();
        std::fs::remove_dir_all(&older).unwrap();
        // Windows refuses to delete a directory while SQLite holds the file.
        drop(db);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn rejects_a_broken_archive_with_a_readable_reason() {
        let root = scratch("broken");
        let path = root.join("bad.cart");
        std::fs::write(&path, b"not a zip").unwrap();

        let db = Db::open(&scratch("broken-db")).unwrap();
        let error = analyze(&db, &path).unwrap_err();
        assert!(error.contains("Not a Retrium cart"), "{error}");

        // Windows refuses to delete a directory while SQLite holds the file.
        drop(db);
        std::fs::remove_dir_all(&root).unwrap();
    }
}
