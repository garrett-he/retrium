//! Canonical content hash for a cart archive.
//!
//! The hash describes the *set of file entries* in a cart, not the archive
//! bytes: two archives packed in a different order, with different timestamps
//! or compression, hash identically. The only entry excluded is the root-level
//! `hash` file itself (it would otherwise reference itself).
//!
//! Encoding, one record per entry:
//!
//! ```text
//! u32le(path_len) || path_utf8 || sha256(content)   // 32 raw bytes
//! ```
//!
//! Records are sorted by their encoded bytes and concatenated, then hashed with
//! SHA-256. The length prefix is mandatory: without it `("ab", h)` and
//! `("a", "b" + h)` would produce the same byte stream.
//!
//! `skills/retrium-cart/scripts/validate_cart.py` implements the same algorithm;
//! `design/fixtures/hash-vectors.json` keeps the two implementations honest.

use std::io;
use std::path::Path;

use sha2::{Digest, Sha256};

/// Name of the root-level integrity file. Never part of the hash input.
pub const HASH_ENTRY: &str = "hash";

/// A single archive entry reduced to its path and content digest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntryDigest {
    pub path: String,
    pub digest: [u8; 32],
}

impl EntryDigest {
    pub fn of_bytes(path: impl Into<String>, bytes: &[u8]) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        Self {
            path: path.into(),
            digest: hasher.finalize().into(),
        }
    }

    /// Hash a file's contents in place, without loading it into memory.
    pub fn of_file(path: impl Into<String>, file: &mut std::fs::File) -> io::Result<Self> {
        let mut hasher = Sha256::new();
        io::copy(file, &mut hasher)?;
        Ok(Self {
            path: path.into(),
            digest: hasher.finalize().into(),
        })
    }
}

/// Compute the canonical hash of an entry set. Order of `entries` is irrelevant.
pub fn tree_hash(mut entries: Vec<EntryDigest>) -> String {
    let mut records: Vec<Vec<u8>> = entries
        .drain(..)
        .map(|entry| {
            let path = entry.path.as_bytes();
            let mut record = Vec::with_capacity(4 + path.len() + 32);
            record.extend_from_slice(&(path.len() as u32).to_le_bytes());
            record.extend_from_slice(path);
            record.extend_from_slice(&entry.digest);
            record
        })
        .collect();

    // Sort the encoded records, exactly as the specification states. This is not
    // the same as sorting by path when path lengths differ, which is why the
    // length prefix is part of the sort key.
    records.sort();

    let mut hasher = Sha256::new();
    for record in &records {
        hasher.update(record);
    }
    to_hex(&hasher.finalize())
}

/// Lowercase hex encoding, kept local so `hash` has no extra dependency.
pub fn to_hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    out
}

/// Digest every file of an archive, skipping directories and the root `hash`.
pub fn digest_archive(path: &Path) -> Result<Vec<EntryDigest>, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("{}: {e}", path.display()))?;

    let mut entries = Vec::with_capacity(archive.len());
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("{}: {e}", path.display()))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        if name == HASH_ENTRY {
            continue;
        }
        let mut hasher = Sha256::new();
        io::copy(&mut entry, &mut hasher).map_err(|e| format!("{}: {e}: {name}", path.display()))?;
        entries.push(EntryDigest {
            path: name,
            digest: hasher.finalize().into(),
        });
    }
    Ok(entries)
}

/// Digest every file under `root`, using `/`-separated relative paths.
pub fn digest_dir(root: &Path) -> Result<Vec<EntryDigest>, String> {
    let mut entries = Vec::new();
    for entry in walkdir::WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let mut file = std::fs::File::open(entry.path()).map_err(|e| e.to_string())?;
        entries.push(EntryDigest::of_file(rel, &mut file).map_err(|e| e.to_string())?);
    }
    Ok(entries)
}

/// Validate the content of a `hash` file: one line of 64 lowercase hex digits,
/// optionally followed by a single newline.
pub fn parse_hash_file(bytes: &[u8]) -> Result<String, String> {
    let text = std::str::from_utf8(bytes).map_err(|_| "hash file is not valid UTF-8".to_string())?;
    let value = text.strip_suffix('\n').unwrap_or(text);
    let value = value.strip_suffix('\r').unwrap_or(value);
    if value.len() != 64 || !value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
        return Err("hash file must be one line of 64 lowercase hex digits".to_string());
    }
    Ok(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vector(name: &str) -> (Vec<EntryDigest>, String) {
        let raw = include_str!("../../design/fixtures/hash-vectors.json");
        let doc: serde_json::Value = serde_json::from_str(raw).expect("fixture parses");
        let case = doc["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["name"] == name)
            .unwrap_or_else(|| panic!("case {name} missing"));

        let entries = case["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| {
                let path = item["path"].as_str().unwrap().to_string();
                match item.get("content_hex").and_then(|v| v.as_str()) {
                    Some(hex) => {
                        let bytes: Vec<u8> = (0..hex.len())
                            .step_by(2)
                            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
                            .collect();
                        EntryDigest::of_bytes(path, &bytes)
                    }
                    None => EntryDigest::of_bytes(path, item["content"].as_str().unwrap().as_bytes()),
                }
            })
            .collect();

        (entries, case["expected"].as_str().unwrap().to_string())
    }

    #[test]
    fn matches_golden_vectors() {
        let raw = include_str!("../../design/fixtures/hash-vectors.json");
        let doc: serde_json::Value = serde_json::from_str(raw).unwrap();
        for case in doc["cases"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let (entries, expected) = vector(name);
            assert_eq!(tree_hash(entries), expected, "vector {name}");
        }
    }

    #[test]
    fn empty_set_is_sha256_of_nothing() {
        assert_eq!(
            tree_hash(Vec::new()),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn order_does_not_matter() {
        let (a, expected) = vector("two_files");
        let (b, _) = vector("two_files_reordered");
        assert_eq!(tree_hash(a.clone()), tree_hash(b.clone()));
        assert_eq!(tree_hash(b), expected);
        assert_eq!(tree_hash(a), expected);
    }

    #[test]
    fn length_prefix_separates_paths() {
        let (a, _) = vector("length_prefix_a");
        let (b, _) = vector("length_prefix_b");
        assert_ne!(tree_hash(a), tree_hash(b));
    }

    #[test]
    fn content_moves_the_hash_but_path_alone_matters_too() {
        let one = tree_hash(vec![EntryDigest::of_bytes("Program/A.EXE", b"x")]);
        let other_path = tree_hash(vec![EntryDigest::of_bytes("Program/B.EXE", b"x")]);
        let other_bytes = tree_hash(vec![EntryDigest::of_bytes("Program/A.EXE", b"y")]);
        assert_ne!(one, other_path);
        assert_ne!(one, other_bytes);
    }

    #[test]
    fn hash_file_accepts_one_trailing_newline_only() {
        let value = "a".repeat(64);
        assert_eq!(parse_hash_file(value.as_bytes()).unwrap(), value);
        assert_eq!(parse_hash_file(format!("{value}\n").as_bytes()).unwrap(), value);
        assert!(parse_hash_file(format!("{value}\n\n").as_bytes()).is_err());
        assert!(parse_hash_file(value.to_uppercase().as_bytes()).is_err());
        assert!(parse_hash_file(format!("sha256:{value}").as_bytes()).is_err());
        assert!(parse_hash_file(b"").is_err());
    }
}
