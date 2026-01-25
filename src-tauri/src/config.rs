use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::DosboxVersionConfig;

#[derive(Clone, Serialize, Deserialize)]
pub struct DosboxConfig {
    pub default: String,
    pub versions: DosboxVersionConfig,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Config {
    pub library: String,
    pub dosbox: DosboxConfig,
}

/// Directory used to store `config.json` (and other Retrium app data).
fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
        .join("retrium")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

/// Platform-specific default DOSBox executable locations.
fn default_dosbox_versions() -> DosboxVersionConfig {
    let mut versions = DosboxVersionConfig::new();

    #[cfg(target_os = "macos")]
    {
        versions.insert(
            "dosbox".to_string(),
            "/Applications/DOSBox.app/Contents/MacOS/DOSBox".to_string(),
        );
    }

    #[cfg(target_os = "linux")]
    {
        versions.insert("dosbox".to_string(), "dosbox".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        versions.insert(
            "dosbox".to_string(),
            "C:\\Program Files (x86)\\DOSBox\\DOSBox.exe".to_string(),
        );
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        versions.insert("dosbox".to_string(), "dosbox".to_string());
    }

    versions
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
                default: "dosbox".to_string(),
                versions: default_dosbox_versions(),
            },
        }
    }
}

impl Config {
    /// Load the configuration from disk, returning `None` when it is missing or invalid.
    pub fn load() -> Option<Config> {
        let content = fs::read_to_string(config_path()).ok()?;
        serde_json::from_str::<Config>(&content).ok()
    }

    /// Persist the configuration to disk as pretty-printed JSON.
    pub fn save(&self) -> Result<(), String> {
        let path = config_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(&path, content).map_err(|e| e.to_string())?;
        Ok(())
    }
}
