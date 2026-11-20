//! `config.json`: where the library lives and which DOSBox to start.
//!
//! One path, no version list, no disk scanning, no reading of the user's own
//! `dosbox.conf` — `-noconfig` guarantees the isolation. A `config.json` that
//! does not match this shape is treated as absent and rebuilt from defaults;
//! there is no migration path on purpose (design document §0.1).
//!
//! `dosbox.scale` is an optional additive key (1 = original, 2 = 2x, 3 = 3x
//! window scale). Older builds ignore it; a missing key means 1.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// Window-scale values accepted in `config.json` and on the command.
///
/// Semantics: the DOS window is a fixed `BASE_W×N × BASE_H×N` window
/// (baseline 320x240), rendered through `output=openglnb`. This is a window
/// size, not a per-game multiplier — every cart opens in the same window.
pub const SCALE_MIN: u8 = 1;
pub const SCALE_MAX: u8 = 5;
/// Baseline the scale multiplies into a window size. 320x240 is 4:3; the
/// common 320x200 games fit it with letterbox borders at exact integer zooms.
pub const SCALE_BASE_W: u32 = 320;
pub const SCALE_BASE_H: u32 = 240;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DosboxConfig {
    pub path: String,
    /// Window enlargement passed to every launch. `None` and `1` behave the same.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scale: Option<u8>,
}

/// Only 2..=SCALE_MAX reach the conf generator; anything else means "original size".
pub fn valid_scale(scale: Option<u8>) -> Option<u8> {
    scale.filter(|value| (2..=SCALE_MAX).contains(value))
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Config {
    pub library: String,
    pub dosbox: DosboxConfig,
}

fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
        .join("retrium")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

/// Platform-specific guess used to prefill the first-run form. Never scanned
/// for, never assumed to exist.
fn default_dosbox_path() -> String {
    #[cfg(target_os = "macos")]
    {
        "/Applications/DOSBox.app/Contents/MacOS/DOSBox".to_string()
    }

    #[cfg(target_os = "linux")]
    {
        "dosbox".to_string()
    }

    #[cfg(target_os = "windows")]
    {
        "C:\\Program Files (x86)\\DOSBox-0.74-3\\DOSBox.exe".to_string()
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        "dosbox".to_string()
    }
}

impl Default for Config {
    fn default() -> Self {
        let library = dirs::document_dir()
            .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
            .join("Retrium")
            .to_string_lossy()
            .to_string();

        Config {
            library,
            dosbox: DosboxConfig {
                path: default_dosbox_path(),
                scale: None,
            },
        }
    }
}

impl Config {
    /// `None` means "no usable config file": unreadable, malformed, or an older
    /// shape. The caller falls back to `Default` and the user re-enters the path.
    pub fn load() -> Option<Config> {
        let content = fs::read_to_string(config_path()).ok()?;
        serde_json::from_str::<Config>(&content).ok()
    }

    pub fn save(&self) -> Result<(), String> {
        let path = config_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(&path, content).map_err(|e| e.to_string())
    }

    pub fn dosbox_path(&self) -> &Path {
        Path::new(&self.dosbox.path)
    }

    /// Refuse to launch anything with a path that is not an existing file.
    pub fn require_dosbox(&self) -> Result<&Path, String> {
        let path = self.dosbox_path();
        if !path.is_file() {
            return Err(format!(
                "DOSBox executable not found: {}. Set it in Settings.",
                path.display()
            ));
        }
        Ok(path)
    }
}

/// Best-effort `-version` probe. Runs at most ~1.5 s and never blocks a launch:
/// failure just means the generated conf says `unknown`.
pub fn probe_version(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }

    let mut child = Command::new(path)
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let stdout = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buffer = String::new();
        let mut reader = std::io::BufReader::new(stdout);
        let _ = reader.read_to_string(&mut buffer);
        let _ = tx.send(buffer);
    });

    let deadline = Instant::now() + Duration::from_millis(500);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
                std::thread::sleep(Duration::from_millis(30));
            }
            Err(_) => {
                let _ = child.kill();
                return None;
            }
        }
    }

    let output = rx.recv_timeout(Duration::from_millis(300)).ok()?;
    parse_version(&output)
}

fn parse_version(output: &str) -> Option<String> {
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // "DOSBox version 0.74-3", "DOSBox 0.74-3", "dosbox-staging 0.81.0"
        let lower = line.to_lowercase();
        if let Some(rest) = lower.strip_prefix("dosbox version") {
            return Some(rest.trim().to_string());
        }
        if lower.starts_with("dosbox") {
            let words: Vec<&str> = line.split_whitespace().collect();
            if words.len() >= 2 {
                return Some(words[1].to_string());
            }
        }
        return Some(line.to_string());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_has_a_library_and_a_single_dosbox_path() {
        let config = Config::default();
        assert!(!config.library.is_empty());
        assert!(!config.dosbox.path.is_empty());
    }

    #[test]
    fn roundtrips_through_json() {
        let config = Config {
            library: "/games".to_string(),
            dosbox: DosboxConfig {
                path: "/usr/bin/dosbox".to_string(),
                scale: Some(2),
            },
        };
        let json = serde_json::to_string(&config).unwrap();
        assert_eq!(serde_json::from_str::<Config>(&json).unwrap(), config);
    }

    #[test]
    fn a_config_without_scale_still_parses() {
        let legacy = r#"{ "library": "C:\\Games", "dosbox": { "path": "C:\\DOSBox\\DOSBox.exe" } }"#;
        let config = serde_json::from_str::<Config>(legacy).unwrap();
        assert_eq!(config.dosbox.scale, None);
    }

    #[test]
    fn only_2_to_5_reach_the_conf_generator() {
        assert_eq!(valid_scale(None), None);
        assert_eq!(valid_scale(Some(1)), None);
        assert_eq!(valid_scale(Some(2)), Some(2));
        assert_eq!(valid_scale(Some(5)), Some(5));
        assert_eq!(valid_scale(Some(6)), None);
    }

    #[test]
    fn the_old_versions_array_does_not_parse() {
        let legacy = r#"{
            "library": "C:\\Games",
            "dosbox": {
                "default": "DOSBox",
                "versions": [{ "name": "DOSBox", "path": "C:\\DOSBox\\DOSBox.exe" }]
            }
        }"#;
        assert!(serde_json::from_str::<Config>(legacy).is_err());
    }

    #[test]
    fn require_dosbox_rejects_missing_files() {
        let config = Config {
            library: ".".to_string(),
            dosbox: DosboxConfig {
                path: "/definitely/not/here/dosbox".to_string(),
                scale: None,
            },
        };
        assert!(config.require_dosbox().is_err());
    }

    #[test]
    fn parses_version_banners() {
        assert_eq!(parse_version("DOSBox version 0.74-3\n").as_deref(), Some("0.74-3"));
        assert_eq!(parse_version("DOSBox 0.74-3").as_deref(), Some("0.74-3"));
        assert_eq!(parse_version("  \n"), None);
    }
}
