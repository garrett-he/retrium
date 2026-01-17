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
    /// Load the configuration from disk, creating a default config file when missing.
    pub fn load() -> Config {
        let path = config_path();
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<Config>(&content) {
                    return config;
                }
            }
        }

        let config = Config::default();
        let _ = config.save();
        config
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
