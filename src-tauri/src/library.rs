//! The library on disk: `carts/`, `installed/` and the archive operations that
//! move data between them.
//!
//! ```text
//! <library>/
//! ├── carts/<uuid>.cart        immutable archive: export source, restore source
//! ├── installed/<uuid>/
//! │   ├── Program/**           DOSBox mounts this as C:
//! │   ├── Config/launch.json   the only hand-editable file
//! │   ├── Resources/cover.png
//! │   └── Runtime/             generated + local state (never exported)
//! └── retrium.db
//! ```

use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use unicode_normalization::UnicodeNormalization;

use crate::db::CartRecord;
use crate::error::FieldError;
use crate::hash::{self, EntryDigest, HASH_ENTRY};
use crate::launch::{FileIndex, Launch};
use crate::manifest::{Manifest, Tool};
use crate::state;

pub const MANIFEST_ENTRY: &str = "manifest.json";
pub const LAUNCH_ENTRY: &str = "Config/launch.json";
pub const COMMIT_FILE: &str = "commit.json";

/// The only top-level names a cart archive may contain.
pub const ROOT_ALLOWED: [&str; 5] = ["hash", "manifest.json", "Program", "Config", "Resources"];

const MAX_ENTRIES: usize = 100_000;
const MAX_TOTAL_BYTES: u64 = 16 * 1024 * 1024 * 1024;

const WINDOWS_RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2",
    "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

#[derive(Debug, Clone)]
pub struct Layout {
    pub root: PathBuf,
}

impl Layout {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn carts_dir(&self) -> PathBuf {
        self.root.join("carts")
    }

    pub fn archive(&self, id: &str) -> PathBuf {
        self.carts_dir().join(format!("{id}.cart"))
    }

    pub fn installed_dir(&self) -> PathBuf {
        self.root.join("installed")
    }

    pub fn install_dir(&self, id: &str) -> PathBuf {
        self.installed_dir().join(id)
    }

    pub fn runtime_dir(&self, id: &str) -> PathBuf {
        self.install_dir(id).join("Runtime")
    }

    pub fn state_dir(&self, id: &str) -> PathBuf {
        self.runtime_dir(id).join(state::STATE_DIR)
    }

    pub fn program_dir(&self, id: &str) -> PathBuf {
        self.install_dir(id).join("Program")
    }

    pub fn ensure(&self) -> Result<(), String> {
        std::fs::create_dir_all(self.carts_dir()).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(self.installed_dir()).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Cart ids present as archives on disk.
    pub fn archive_ids(&self) -> Result<Vec<String>, String> {
        let mut ids = Vec::new();
        let entries = match std::fs::read_dir(self.carts_dir()) {
            Ok(entries) => entries,
            Err(_) => return Ok(ids),
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("cart") {
                continue;
            }
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                ids.push(stem.to_string());
            }
        }
        ids.sort();
        Ok(ids)
    }
}

/// Bookkeeping written next to the installed copy so the index can be rebuilt
/// without re-hashing every archive.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub revision: i64,
    pub package_hash: String,
    pub manifest_version: u32,
}

pub fn read_commit(layout: &Layout, id: &str) -> Option<CommitInfo> {
    let path = layout.runtime_dir(id).join(COMMIT_FILE);
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn write_commit(layout: &Layout, id: &str, info: &CommitInfo) -> Result<(), String> {
    let runtime = layout.runtime_dir(id);
    std::fs::create_dir_all(&runtime).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(info).map_err(|e| e.to_string())?;
    std::fs::write(runtime.join(COMMIT_FILE), json).map_err(|e| e.to_string())
}

/// Where the bytes of one exported entry come from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EntrySource {
    /// A file in `installed/`.
    File(PathBuf),
    /// An entry kept from the current archive.
    Archive,
}

/// One entry of the archive as it exists today, before any extraction.
#[derive(Debug, Clone)]
pub struct ArchiveEntry {
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct Inspection {
    pub files: Vec<ArchiveEntry>,
    pub hash: String,
    pub manifest: Manifest,
    pub launch: Launch,
    pub index: FileIndex,
}

/// Read a cart without extracting anything: shape, hash, manifest, launch.
///
/// The expensive step (re-hashing every entry) comes last, after the cheap
/// checks have rejected obviously broken archives.
pub fn inspect(path: &Path) -> Result<Inspection, FieldError> {
    let file = std::fs::File::open(path).map_err(|e| FieldError::new("cart", format!("cannot open: {e}")))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|_| FieldError::new("cart", "Not a Retrium cart (not a ZIP archive)"))?;

    let mut names: Vec<String> = Vec::new();
    let mut files: Vec<ArchiveEntry> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut total: u64 = 0;

    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|e| FieldError::new("cart", format!("unreadable entry: {e}")))?;

        let name = entry.name().trim_end_matches('/').to_string();
        if name.is_empty() {
            continue;
        }

        if !is_safe_name(&name) {
            return Err(FieldError::new(
                format!("entry {name}"),
                "unsafe path (absolute, drive letter, traversal or reserved name)",
            ));
        }

        // Symlinks would let an archive write outside its own tree.
        if entry.unix_mode().is_some_and(|mode| mode & 0o170000 == 0o120000) {
            return Err(FieldError::new(format!("entry {name}"), "symlinks are not allowed"));
        }
        if entry.encrypted() {
            return Err(FieldError::new(
                format!("entry {name}"),
                "encrypted archives are not supported",
            ));
        }

        let root = name.split('/').next().unwrap_or_default();
        if !ROOT_ALLOWED.contains(&root) {
            return Err(FieldError::new(
                format!("entry {name}"),
                format!("only {} are allowed at the archive root", ROOT_ALLOWED.join(", ")),
            ));
        }

        // Case- and normalization-insensitive uniqueness: "SAVE.DAT" and
        // "save.dat" are the same file on Windows and macOS.
        let key = name.nfc().collect::<String>().to_lowercase();
        if !seen.insert(key) {
            return Err(FieldError::new(
                format!("entry {name}"),
                "duplicates another entry (case or Unicode normalization)",
            ));
        }

        if !entry.is_dir() {
            total = total.saturating_add(entry.size());
            if files.len() >= MAX_ENTRIES {
                return Err(FieldError::new("cart", "too many entries"));
            }
            names.push(name.clone());
            files.push(ArchiveEntry {
                name,
                size: entry.size(),
            });
        }
    }

    if total > MAX_TOTAL_BYTES {
        return Err(FieldError::new("cart", "archive expands beyond the size limit"));
    }

    for required in [HASH_ENTRY, MANIFEST_ENTRY, LAUNCH_ENTRY] {
        if !names.iter().any(|name| name == required) {
            return Err(FieldError::new(required, "missing from the archive"));
        }
    }

    let hash_value =
        hash::parse_hash_file(&read_entry(&mut archive, HASH_ENTRY)?).map_err(|e| FieldError::new(HASH_ENTRY, e))?;

    let manifest = Manifest::from_bytes(&read_entry(&mut archive, MANIFEST_ENTRY)?)?;
    let launch = Launch::from_bytes(&read_entry(&mut archive, LAUNCH_ENTRY)?)?;

    let computed = hash::tree_hash(hash::digest_archive(path).map_err(|e| FieldError::new(HASH_ENTRY, e))?);
    if computed != hash_value {
        return Err(FieldError::new(
            HASH_ENTRY,
            format!("does not match the archive contents (expected {computed})"),
        ));
    }

    let index = FileIndex::from_entries(names.iter().cloned());
    launch.validate_files(&index)?;

    Ok(Inspection {
        files,
        hash: computed,
        manifest,
        launch,
        index,
    })
}

fn read_entry<R: Read + std::io::Seek>(archive: &mut zip::ZipArchive<R>, name: &str) -> Result<Vec<u8>, FieldError> {
    let mut entry = archive
        .by_name(name)
        .map_err(|e| FieldError::new(name, format!("unreadable: {e}")))?;
    let mut bytes = Vec::new();
    entry
        .read_to_end(&mut bytes)
        .map_err(|e| FieldError::new(name, format!("unreadable: {e}")))?;
    Ok(bytes)
}

/// Reject anything that could escape the extraction root or hit a reserved name.
fn is_safe_name(name: &str) -> bool {
    if name.is_empty() || name.starts_with('/') || name.contains('\\') || name.contains(':') {
        return false;
    }
    for segment in name.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return false;
        }
        if segment.ends_with('.') || segment.ends_with(' ') {
            return false;
        }
        let stem = segment.split('.').next().unwrap_or_default().to_uppercase();
        if WINDOWS_RESERVED.contains(&stem.as_str()) {
            return false;
        }
    }
    true
}

/// Extract `Program/**`, `Config/launch.json` and `Resources/**`.
/// `hash` and `manifest.json` never touch the disk.
pub fn extract(archive_path: &Path, layout: &Layout, id: &str) -> Result<(), String> {
    extract_filtered(archive_path, layout, id, true)
}

/// Extract only `Program/**` and `Resources/**`, leaving `Config/` alone.
/// Used by "repair": the user's edited `launch.json` survives.
pub fn extract_program(archive_path: &Path, layout: &Layout, id: &str) -> Result<(), String> {
    extract_filtered(archive_path, layout, id, false)
}

fn extract_filtered(archive_path: &Path, layout: &Layout, id: &str, with_config: bool) -> Result<(), String> {
    let destination = layout.install_dir(id);
    std::fs::create_dir_all(&destination).map_err(|e| e.to_string())?;

    let file = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        let kept =
            name.starts_with("Program/") || name.starts_with("Resources/") || (with_config && name == LAUNCH_ENTRY);
        if !kept || !is_safe_name(&name) {
            continue;
        }

        let target = destination.join(&name);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = std::fs::File::create(&target).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// The four-row matrix from the design document §5.3. This is the only place
/// that decides which copy of a file is authoritative for an export.
pub fn collect_export_entries(layout: &Layout, id: &str) -> Result<Vec<(String, EntrySource)>, String> {
    let archive_path = layout.archive(id);
    let installed = layout.install_dir(id);
    let state_dir = layout.state_dir(id);

    let archive_names: BTreeSet<String> = {
        let mut names = BTreeSet::new();
        // A cart built directly in `installed/` has no archive yet: export then
        // simply takes everything from disk.
        if archive_path.is_file() {
            let mut archive = open_archive(&archive_path)?;
            for index in 0..archive.len() {
                let entry = archive.by_index(index).map_err(|e| e.to_string())?;
                if entry.is_dir() {
                    continue;
                }
                let name = entry.name().to_string();
                if name == HASH_ENTRY || name == MANIFEST_ENTRY {
                    continue;
                }
                names.insert(name);
            }
        }
        names
    };

    let mut installed_names: BTreeSet<String> = BTreeSet::new();
    for sub in ["Program", "Resources"] {
        let root = installed.join(sub);
        for entry in walkdir::WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let rel = entry
                .path()
                .strip_prefix(&installed)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            installed_names.insert(rel);
        }
    }

    let candidates: BTreeSet<String> = installed_names.union(&archive_names).cloned().collect();
    let mut picked: BTreeMap<String, EntrySource> = BTreeMap::new();

    for name in candidates {
        let in_installed = installed_names.contains(&name);
        let in_archive = archive_names.contains(&name);
        // `State/` mirrors the cart namespace: State/Program/SAVE.DAT.
        let in_state = state_dir.join(&name).exists();

        match (in_installed, in_state, in_archive) {
            // Never touched by the program: the current installed file wins, so
            // patches and replaced executables make it into the next export.
            (true, false, _) => {
                picked.insert(name.clone(), EntrySource::File(installed.join(&name)));
            }
            // Rewritten by the program: keep the archived version, the change
            // stays local.
            (true, true, true) => {
                picked.insert(name, EntrySource::Archive);
            }
            // Produced by the program, absent from the cart: skip it.
            (true, true, false) => {}
            // Gone from the working copy but present in the cart: keep the
            // archived version. Deleting data from the archive is irreversible,
            // and "the program removed it" is indistinguishable from "the user
            // removed it".
            (false, _, true) => {
                picked.insert(name, EntrySource::Archive);
            }
            (false, _, false) => {}
        }
    }

    let launch = installed.join(LAUNCH_ENTRY);
    if !launch.is_file() {
        return Err(format!("missing {}", launch.display()));
    }
    picked.insert(LAUNCH_ENTRY.to_string(), EntrySource::File(launch));

    Ok(picked.into_iter().collect())
}

/// Delete a cart completely: archive, install directory, index row (the caller
/// removes the row).
pub fn remove(layout: &Layout, id: &str) -> Result<(), String> {
    let archive = layout.archive(id);
    if archive.exists() {
        std::fs::remove_file(&archive).map_err(|e| e.to_string())?;
    }
    let installed = layout.install_dir(id);
    if installed.exists() {
        std::fs::remove_dir_all(&installed).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Discard everything the player produced: the working copy and the save layer.
/// `Config/launch.json` survives — it is configuration, not progress.
pub fn reset(layout: &Layout, id: &str) -> Result<(), String> {
    let archive = layout.archive(id);
    if !archive.is_file() {
        return Err(format!("archive is missing: {}", archive.display()));
    }

    let installed = layout.install_dir(id);
    let program = installed.join("Program");
    if program.exists() {
        std::fs::remove_dir_all(&program).map_err(|e| e.to_string())?;
    }
    state::clear(&layout.state_dir(id))?;

    let runtime = layout.runtime_dir(id);
    let _ = std::fs::remove_file(runtime.join(state::BASELINE_FILE));
    let _ = std::fs::remove_file(runtime.join(state::RUNNING_FILE));

    extract_program(&archive, layout, id)?;
    restore_missing_launch(&archive, layout, id)?;
    Ok(())
}

/// Re-extract the program but keep the saves: the way out of a broken install.
pub fn repair(layout: &Layout, id: &str) -> Result<(), String> {
    let archive = layout.archive(id);
    if !archive.is_file() {
        return Err(format!("archive is missing: {}", archive.display()));
    }

    let installed = layout.install_dir(id);
    for sub in ["Program", "Resources"] {
        let path = installed.join(sub);
        if path.exists() {
            std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
        }
    }

    extract_program(&archive, layout, id)?;
    restore_missing_launch(&archive, layout, id)?;
    state::apply(&layout.state_dir(id), &installed)?;
    Ok(())
}

/// `launch.json` is usually kept through a reset, but a cart without one cannot
/// start at all, so restore it when it is missing.
fn restore_missing_launch(archive: &Path, layout: &Layout, id: &str) -> Result<(), String> {
    let launch = layout.install_dir(id).join(LAUNCH_ENTRY);
    if launch.is_file() {
        return Ok(());
    }
    extract(archive, layout, id)
}

/// Rebuild `carts/<id>.cart` from the installed copy, returning the new hash.
pub fn commit(
    layout: &Layout,
    id: &str,
    manifest: &Manifest,
    revision: i64,
    tool: &Tool,
    created_at: &str,
) -> Result<(Manifest, String), String> {
    let updated = prepare_manifest(manifest, revision, tool, created_at);
    let collected = collect_export_entries(layout, id)?;
    // Manifest bytes must be final before the hash is computed, otherwise the
    // archive hash can never match its own content.
    let manifest_bytes = updated.to_json().into_bytes();

    let archive_path = layout.archive(id);
    let package_hash = build_archive(Some(&archive_path), &archive_path, &collected, &manifest_bytes)?;
    Ok((updated, package_hash))
}

/// The hash `commit` would produce, without touching the archive. This is how
/// "has anything changed since the last export?" is answered: same matrix, same
/// hash function, no state flag.
pub fn export_hash(
    layout: &Layout,
    id: &str,
    manifest: &Manifest,
    revision: i64,
    tool: &Tool,
    created_at: &str,
) -> Result<String, String> {
    let updated = prepare_manifest(manifest, revision, tool, created_at);
    let collected = collect_export_entries(layout, id)?;
    let manifest_bytes = updated.to_json().into_bytes();
    let archive_path = layout.archive(id);
    build_archive(None, &archive_path, &collected, &manifest_bytes)
}

fn prepare_manifest(manifest: &Manifest, revision: i64, tool: &Tool, created_at: &str) -> Manifest {
    let mut updated = manifest.clone();
    updated.cart.revision = revision;
    updated.cart.tool = tool.clone();
    updated.cart.created_at = created_at.to_string();
    updated
}

/// Build a cart archive, or only compute its hash when `destination` is `None`.
/// Entries are written in name order and no directory entries are emitted, so
/// the packing tool cannot change the hash.
fn build_archive(
    destination: Option<&Path>,
    archive_path: &Path,
    entries: &[(String, EntrySource)],
    manifest_bytes: &[u8],
) -> Result<String, String> {
    let mut all: Vec<(&str, EntrySource)> = entries
        .iter()
        .map(|(name, source)| (name.as_str(), source.clone()))
        .collect();
    all.push((MANIFEST_ENTRY, EntrySource::Archive)); // handled by name below
    all.sort_by(|a, b| a.0.cmp(b.0));

    let mut digests: Vec<EntryDigest> = Vec::with_capacity(all.len());
    for (name, source) in &all {
        if *name == MANIFEST_ENTRY {
            digests.push(EntryDigest::of_bytes(*name, manifest_bytes));
        } else {
            digests.push(digest_of(name, source, archive_path)?);
        }
    }
    let package_hash = hash::tree_hash(digests);

    let Some(destination) = destination else {
        return Ok(package_hash);
    };

    let temp = destination.with_extension("cart.tmp");
    {
        let file = std::fs::File::create(&temp).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        zip.start_file(HASH_ENTRY, options).map_err(|e| e.to_string())?;
        zip.write_all(package_hash.as_bytes()).map_err(|e| e.to_string())?;

        for (name, source) in &all {
            zip.start_file(*name, options).map_err(|e| e.to_string())?;
            if *name == MANIFEST_ENTRY {
                zip.write_all(manifest_bytes).map_err(|e| e.to_string())?;
            } else {
                copy_entry(name, source, destination, &mut zip)?;
            }
        }

        let mut file = zip.finish().map_err(|e| e.to_string())?;
        file.flush().map_err(|e| e.to_string())?;
    }

    replace_file(&temp, destination)?;
    Ok(package_hash)
}

/// Write a cart archive in place; used by the tests to build fixtures.
#[cfg(test)]
fn write_archive(
    destination: &Path,
    entries: &[(String, EntrySource)],
    manifest_bytes: &[u8],
) -> Result<String, String> {
    build_archive(Some(destination), destination, entries, manifest_bytes)
}

fn open_archive(path: &Path) -> Result<zip::ZipArchive<std::fs::File>, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    zip::ZipArchive::new(file).map_err(|e| format!("{}: {e}", path.display()))
}

fn digest_of(name: &str, source: &EntrySource, archive_path: &Path) -> Result<EntryDigest, String> {
    match source {
        EntrySource::File(path) => {
            let mut file = std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
            EntryDigest::of_file(name, &mut file).map_err(|e| e.to_string())
        }
        EntrySource::Archive => {
            let mut archive = open_archive(archive_path)?;
            let mut entry = archive.by_name(name).map_err(|e| format!("{name}: {e}"))?;
            let mut hasher = Sha256::new();
            std::io::copy(&mut entry, &mut hasher).map_err(|e| e.to_string())?;
            Ok(EntryDigest {
                path: name.to_string(),
                digest: hasher.finalize().into(),
            })
        }
    }
}

fn copy_entry<W: Write>(name: &str, source: &EntrySource, archive_path: &Path, out: &mut W) -> Result<(), String> {
    match source {
        EntrySource::File(path) => {
            let mut file = std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
            std::io::copy(&mut file, out).map_err(|e| e.to_string())?;
        }
        EntrySource::Archive => {
            let mut archive = open_archive(archive_path)?;
            let mut entry = archive.by_name(name).map_err(|e| format!("{name}: {e}"))?;
            std::io::copy(&mut entry, out).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Swap a freshly written archive into place. Public wrapper over the atomic
/// replace so import can reuse it.
pub fn replace_archive(temp: &Path, destination: &Path) -> Result<(), String> {
    replace_file(temp, destination)
}

/// Replace `destination` with `temp`, keeping the old file until the new one is
/// in place so a crash cannot leave the library without an archive.
fn replace_file(temp: &Path, destination: &Path) -> Result<(), String> {
    if !destination.exists() {
        return std::fs::rename(temp, destination).map_err(|e| e.to_string());
    }

    let backup = destination.with_extension("cart.bak");
    let _ = std::fs::remove_file(&backup);
    std::fs::rename(destination, &backup).map_err(|e| e.to_string())?;

    match std::fs::rename(temp, destination) {
        Ok(()) => {
            let _ = std::fs::remove_file(&backup);
            Ok(())
        }
        Err(error) => {
            let _ = std::fs::rename(&backup, destination);
            Err(error.to_string())
        }
    }
}

/// Rebuild one index row from what is on disk. Used when `retrium.db` was
/// recreated: the commit cache supplies the hash, so no full scan is needed.
pub fn load_record(layout: &Layout, id: &str) -> Result<Option<CartRecord>, String> {
    let archive_path = layout.archive(id);
    if !archive_path.is_file() {
        return Ok(None);
    }

    let mut archive = open_archive(&archive_path)?;
    let manifest = Manifest::from_bytes(&read_entry(&mut archive, MANIFEST_ENTRY).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    let package_hash = match read_commit(layout, id) {
        Some(info) => info.package_hash,
        // No commit cache: fall back to a full hash so dirty detection stays
        // correct at the price of one sequential read.
        None => hash::tree_hash(hash::digest_archive(&archive_path).map_err(|e| e.to_string())?),
    };

    Ok(Some(CartRecord {
        manifest,
        package_hash,
        raw_path: format!("carts/{id}.cart"),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{CartBlock, ProgramBlock};

    const ID: &str = "019ae4c1-2f3b-7c4d-8e9f-0a1b2c3d4e5f";

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "retrium-lib-{tag}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn manifest() -> Manifest {
        Manifest {
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
        }
    }

    fn write_at(path: PathBuf, contents: &str) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, contents).unwrap();
    }

    const LAUNCH: &str = r#"{
        "version": 1,
        "targets": [{ "id": "game", "label": "Game", "executable": "GAME.EXE" }]
    }"#;

    /// Build a cart the way the app does: files in `installed/`, then commit.
    fn build_cart(root: &Path, files: &[(&str, &str)]) -> PathBuf {
        let layout = Layout::new(root);
        layout.ensure().unwrap();
        let installed = layout.install_dir(ID);
        for (name, contents) in files {
            let path = installed.join(name);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, contents).unwrap();
        }
        let launch = installed.join(LAUNCH_ENTRY);
        std::fs::create_dir_all(launch.parent().unwrap()).unwrap();
        std::fs::write(launch, LAUNCH).unwrap();

        let manifest = manifest();
        let entries = collect_export_entries(&layout, ID).unwrap();
        let bytes = manifest.to_json().into_bytes();
        let archive = layout.archive(ID);
        write_archive(&archive, &entries, &bytes).unwrap();
        archive
    }

    #[test]
    fn inspects_a_well_formed_cart() {
        let root = scratch("inspect");
        let archive = build_cart(&root, &[("Program/GAME.EXE", "binary")]);

        let inspection = inspect(&archive).unwrap();
        assert_eq!(inspection.manifest.program.name, "Test");
        assert_eq!(inspection.hash.len(), 64);
        // hash + manifest + launch + GAME.EXE
        assert_eq!(inspection.files.len(), 4);
        assert!(inspection.index.file("program/game.exe").is_some());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn rejects_a_tampered_archive() {
        let root = scratch("tamper");
        let archive = build_cart(&root, &[("Program/A.EXE", "x")]);

        let broken = root.join("broken.cart");
        let file = std::fs::File::create(&broken).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        let mut source = open_archive(&archive).unwrap();
        for index in 0..source.len() {
            let mut entry = source.by_index(index).unwrap();
            let name = entry.name().to_string();
            zip.start_file(name.clone(), options).unwrap();
            if name == "Program/A.EXE" {
                zip.write_all(b"changed").unwrap();
            } else {
                std::io::copy(&mut entry, &mut zip).unwrap();
            }
        }
        zip.finish().unwrap();

        assert_eq!(inspect(&broken).unwrap_err().path, "hash");
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn rejects_unsafe_entries() {
        for name in ["../evil.exe", "/etc/passwd", "C:/windows/x", "CON", "Program/../x"] {
            assert!(!is_safe_name(name), "{name}");
        }
        for name in ["hash", "Program/GAME.EXE", "Resources/cover.png", "Config/launch.json"] {
            assert!(is_safe_name(name), "{name}");
        }
    }

    #[test]
    fn extracts_only_the_installed_subset() {
        let root = scratch("extract");
        let archive = build_cart(&root, &[("Program/GAME.EXE", "x")]);
        let layout = Layout::new(&root);
        std::fs::remove_dir_all(layout.install_dir(ID)).unwrap();

        extract(&archive, &layout, ID).unwrap();
        assert!(layout.program_dir(ID).join("GAME.EXE").is_file());
        assert!(layout.install_dir(ID).join(LAUNCH_ENTRY).is_file());
        assert!(!layout.install_dir(ID).join(HASH_ENTRY).exists());
        assert!(!layout.install_dir(ID).join(MANIFEST_ENTRY).exists());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn export_matrix_keeps_archive_version_for_files_the_program_touched() {
        let root = scratch("matrix");
        build_cart(&root, &[("Program/GAME.EXE", "original")]);
        let layout = Layout::new(&root);

        // The program rewrote GAME.EXE and created a save; the user patched a
        // file the program never touched.
        write_at(layout.program_dir(ID).join("GAME.EXE"), "patched");
        write_at(layout.program_dir(ID).join("SAVE01.DAT"), "save");
        write_at(layout.program_dir(ID).join("PATCH.DAT"), "note");
        write_at(layout.state_dir(ID).join("Program/GAME.EXE"), "patched");
        write_at(layout.state_dir(ID).join("Program/SAVE01.DAT"), "save");

        let entries = collect_export_entries(&layout, ID).unwrap();
        let by_name: BTreeMap<&str, &EntrySource> =
            entries.iter().map(|(name, source)| (name.as_str(), source)).collect();

        assert_eq!(by_name["Program/GAME.EXE"], &EntrySource::Archive);
        assert!(matches!(by_name["Program/PATCH.DAT"], EntrySource::File(_)));
        assert!(!by_name.contains_key("Program/SAVE01.DAT"));
        assert!(by_name.contains_key("Config/launch.json"));

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn export_keeps_archived_files_that_disappeared_from_disk() {
        let root = scratch("vanish");
        build_cart(&root, &[("Program/GAME.EXE", "x"), ("Program/DATA.DAT", "data")]);
        let layout = Layout::new(&root);

        std::fs::remove_file(layout.program_dir(ID).join("DATA.DAT")).unwrap();

        let entries = collect_export_entries(&layout, ID).unwrap();
        assert!(entries
            .iter()
            .any(|(name, source)| name == "Program/DATA.DAT" && *source == EntrySource::Archive));

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn commit_changes_the_hash_and_keeps_the_id() {
        let root = scratch("commit");
        let archive = build_cart(&root, &[("Program/GAME.EXE", "original")]);
        let layout = Layout::new(&root);

        let before = inspect(&archive).unwrap();
        write_at(layout.program_dir(ID).join("GAME.EXE"), "patched");

        let (updated, hash) = commit(
            &layout,
            ID,
            &before.manifest,
            2,
            &Tool {
                app: "Retrium".to_string(),
                version: "0.3.0".to_string(),
                host: "test".to_string(),
            },
            "2026-11-21T13:00:00Z",
        )
        .unwrap();

        assert_eq!(updated.cart.id, ID);
        assert_eq!(updated.cart.revision, 2);

        let after = inspect(&archive).unwrap();
        assert_eq!(after.hash, hash);
        assert_ne!(after.hash, before.hash);
        assert_eq!(after.manifest.cart.revision, 2);
        assert_eq!(after.manifest.cart.created_at, "2026-11-21T13:00:00Z");

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn commit_is_idempotent_when_nothing_changed() {
        let root = scratch("idem");
        let archive = build_cart(&root, &[("Program/GAME.EXE", "x")]);
        let layout = Layout::new(&root);
        let before = inspect(&archive).unwrap();

        let tool = before.manifest.cart.tool.clone();
        let (_, hash) = commit(
            &layout,
            ID,
            &before.manifest,
            before.manifest.cart.revision,
            &tool,
            &before.manifest.cart.created_at,
        )
        .unwrap();

        assert_eq!(hash, before.hash);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn reset_clears_progress_but_keeps_the_edited_launch_json() {
        let root = scratch("reset");
        build_cart(&root, &[("Program/GAME.EXE", "original")]);
        let layout = Layout::new(&root);

        let launch = layout.install_dir(ID).join(LAUNCH_ENTRY);
        std::fs::write(&launch, LAUNCH).unwrap();
        write_at(layout.program_dir(ID).join("SAVE01.DAT"), "save");
        write_at(layout.state_dir(ID).join("Program/SAVE01.DAT"), "save");
        write_at(layout.state_dir(ID).join("Program/GAME.EXE"), "patched");
        write_at(layout.program_dir(ID).join("GAME.EXE"), "patched");

        reset(&layout, ID).unwrap();

        assert!(!layout.state_dir(ID).exists());
        assert!(!layout.program_dir(ID).join("SAVE01.DAT").exists());
        assert_eq!(
            std::fs::read_to_string(layout.program_dir(ID).join("GAME.EXE")).unwrap(),
            "original",
            "a reset restores the program from the archive"
        );
        assert!(launch.is_file(), "launch.json is configuration, not progress");
        assert!(!layout.runtime_dir(ID).join(state::BASELINE_FILE).exists());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn repair_keeps_the_saves() {
        let root = scratch("repair");
        build_cart(&root, &[("Program/GAME.EXE", "original")]);
        let layout = Layout::new(&root);

        write_at(layout.program_dir(ID).join("GAME.EXE"), "broken beyond repair");
        write_at(layout.state_dir(ID).join("Program/SAVE01.DAT"), "precious");

        repair(&layout, ID).unwrap();

        assert_eq!(
            std::fs::read_to_string(layout.program_dir(ID).join("GAME.EXE")).unwrap(),
            "original"
        );
        assert!(
            layout.program_dir(ID).join("SAVE01.DAT").is_file(),
            "the save layer is re-applied after a repair"
        );

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn reset_restores_a_missing_launch_json() {
        let root = scratch("reset-launch");
        build_cart(&root, &[("Program/GAME.EXE", "x")]);
        let layout = Layout::new(&root);

        std::fs::remove_dir_all(layout.install_dir(ID).join("Config")).unwrap();
        reset(&layout, ID).unwrap();
        assert!(layout.install_dir(ID).join(LAUNCH_ENTRY).is_file());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn remove_deletes_everything() {
        let root = scratch("remove");
        build_cart(&root, &[("Program/GAME.EXE", "x")]);
        let layout = Layout::new(&root);

        remove(&layout, ID).unwrap();
        assert!(!layout.archive(ID).exists());
        assert!(!layout.install_dir(ID).exists());

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn export_hash_reports_whether_anything_changed() {
        let root = scratch("dirty");
        let archive = build_cart(&root, &[("Program/GAME.EXE", "original")]);
        let layout = Layout::new(&root);
        let before = inspect(&archive).unwrap();
        let cart = &before.manifest.cart;

        let clean = export_hash(
            &layout,
            ID,
            &before.manifest,
            cart.revision,
            &cart.tool,
            &cart.created_at,
        )
        .unwrap();
        assert_eq!(clean, before.hash, "an untouched cart must not look dirty");

        write_at(layout.program_dir(ID).join("PATCH.DAT"), "note");
        let dirty = export_hash(
            &layout,
            ID,
            &before.manifest,
            cart.revision,
            &cart.tool,
            &cart.created_at,
        )
        .unwrap();
        assert_ne!(dirty, before.hash);

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_save_in_state_does_not_make_the_cart_dirty() {
        let root = scratch("dirty-save");
        let archive = build_cart(&root, &[("Program/GAME.EXE", "x")]);
        let layout = Layout::new(&root);
        let before = inspect(&archive).unwrap();
        let cart = &before.manifest.cart;

        // A run rewrote the executable and produced a save.
        write_at(layout.program_dir(ID).join("GAME.EXE"), "patched");
        write_at(layout.program_dir(ID).join("SAVE01.DAT"), "save");
        write_at(layout.state_dir(ID).join("Program/GAME.EXE"), "patched");
        write_at(layout.state_dir(ID).join("Program/SAVE01.DAT"), "save");

        let hash = export_hash(
            &layout,
            ID,
            &before.manifest,
            cart.revision,
            &cart.tool,
            &cart.created_at,
        )
        .unwrap();
        assert_eq!(hash, before.hash, "saves belong to the player, not the cart");

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn load_record_falls_back_to_hashing_without_a_commit_cache() {
        let root = scratch("record");
        let archive = build_cart(&root, &[("Program/GAME.EXE", "x")]);
        let layout = Layout::new(&root);
        let expected = inspect(&archive).unwrap().hash;

        let record = load_record(&layout, ID).unwrap().unwrap();
        assert_eq!(record.package_hash, expected);
        assert_eq!(record.raw_path, format!("carts/{ID}.cart"));

        std::fs::remove_dir_all(&root).unwrap();
    }
}
