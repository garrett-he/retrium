use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// A single configured DOSBox executable.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DosboxVersion {
    pub name: String,
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DosboxConfig {
    pub default: String,
    pub versions: Vec<DosboxVersion>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Config {
    pub library: String,
    pub dosbox: DosboxConfig,
}

/// Legacy pre-redesign config where versions were a name-to-path map.
#[derive(Deserialize)]
struct LegacyDosboxConfig {
    default: String,
    versions: BTreeMap<String, String>,
}

#[derive(Deserialize)]
struct LegacyConfig {
    library: String,
    dosbox: LegacyDosboxConfig,
}

impl From<LegacyConfig> for Config {
    fn from(legacy: LegacyConfig) -> Self {
        let versions = legacy
            .dosbox
            .versions
            .into_iter()
            .map(|(name, path)| DosboxVersion { name, path })
            .collect();
        Config {
            library: legacy.library,
            dosbox: DosboxConfig {
                default: legacy.dosbox.default,
                versions,
            },
        }
    }
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

/// Platform-specific default DOSBox executable location.
fn default_dosbox_version() -> DosboxVersion {
    #[cfg(target_os = "macos")]
    {
        DosboxVersion {
            name: "DOSBox".to_string(),
            path: "/Applications/DOSBox.app/Contents/MacOS/DOSBox".to_string(),
        }
    }

    #[cfg(target_os = "linux")]
    {
        DosboxVersion {
            name: "DOSBox".to_string(),
            path: "dosbox".to_string(),
        }
    }

    #[cfg(target_os = "windows")]
    {
        DosboxVersion {
            name: "DOSBox".to_string(),
            path: "C:\\Program Files (x86)\\DOSBox\\DOSBox.exe".to_string(),
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        DosboxVersion {
            name: "DOSBox".to_string(),
            path: "dosbox".to_string(),
        }
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
                default: "DOSBox".to_string(),
                versions: vec![default_dosbox_version()],
            },
        }
    }
}

impl Config {
    /// Load the configuration from disk, migrating the legacy format when needed.
    pub fn load() -> Option<Config> {
        let content = fs::read_to_string(config_path()).ok()?;
        match serde_json::from_str::<Config>(&content) {
            Ok(config) => Some(config),
            Err(_) => {
                let legacy = serde_json::from_str::<LegacyConfig>(&content).ok()?;
                Some(Config::from(legacy))
            }
        }
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

    /// Return the configured version by name, if present.
    pub fn version(&self, name: &str) -> Option<&DosboxVersion> {
        self.dosbox.versions.iter().find(|v| v.name == name)
    }

    /// Return the default version, falling back to the first one.
    pub fn default_version(&self) -> Option<&DosboxVersion> {
        self.version(&self.dosbox.default)
            .or_else(|| self.dosbox.versions.first())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_has_one_version() {
        let config = Config::default();
        assert_eq!(config.dosbox.versions.len(), 1);
        assert_eq!(config.dosbox.versions[0].name, "DOSBox");
        assert_eq!(config.dosbox.default, "DOSBox");
    }

    #[test]
    fn roundtrips_through_json() {
        let config = Config::default();
        let json = serde_json::to_string(&config).expect("serialize");
        let parsed: Config = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(config, parsed);
    }

    #[test]
    fn migrates_legacy_config() {
        let legacy = r#"{
            "library": "C:\\Games",
            "dosbox": {
                "default": "dosbox",
                "versions": { "dosbox": "C:\\DOSBox\\dosbox.exe", "staging": "C:\\DOSBox\\staging.exe" }
            }
        }"#;
        let config: Config = serde_json::from_str::<LegacyConfig>(legacy)
            .expect("legacy parse")
            .into();
        assert_eq!(config.library, "C:\\Games");
        assert_eq!(config.dosbox.versions.len(), 2);
        assert!(config.version("staging").is_some());
        assert_eq!(config.default_version().map(|v| v.name.as_str()), Some("dosbox"));
    }

    #[test]
    fn default_version_falls_back_to_first() {
        let mut config = Config::default();
        config.dosbox.default = "missing".to_string();
        assert_eq!(config.default_version().map(|v| v.name.as_str()), Some("DOSBox"));
    }
}
