//! `Config/launch.json`: the single source of truth for how a cart starts.
//!
//! It describes *what can be started* (`targets`) and *what DOSBox environment
//! each entry needs* (`profiles`). Retrium never ships a baseline configuration:
//! at launch it writes only the overrides into `Runtime/dosbox.conf` and lets
//! the user's own DOSBox fill in everything else, isolated with
//! `-noconfig -conf`.
//!
//! Validation runs twice — once at import, once before every launch — because
//! `installed/<id>/Config/launch.json` is user-editable. Both runs use the code
//! in this module; the only difference is where "does this file exist" is
//! answered from (ZIP entry index vs. disk).

use std::collections::{BTreeMap, HashMap};
use std::path::Path;

use serde::de::{self, Deserializer};
use serde::ser::Serializer;
use serde::{Deserialize, Serialize};

use crate::error::{self, FieldError};

pub const LAUNCH_VERSION: u32 = 1;

pub const MACHINES: [&str; 13] = [
    "hercules",
    "cga_mono",
    "cga",
    "tandy",
    "pcjr",
    "ega",
    "vgaonly",
    "svga_s3",
    "svga_et3000",
    "svga_et4000",
    "svga_paradise",
    "vesa_nolfb",
    "vesa_oldvbe",
];

pub const CORES: [&str; 4] = ["auto", "normal", "simple", "dynamic"];

/// Sound Blaster types, in the order the specification lists them.
pub const SB_TYPES: [&str; 6] = ["sb1", "sb2", "sbpro1", "sbpro2", "sb16", "gb"];

/// Section names accepted in `extra` keys. `autoexec` is absent on purpose:
/// the generator composes it, an author must not.
pub const EXTRA_SECTIONS: [&str; 13] = [
    "sdl", "dosbox", "render", "cpu", "mixer", "midi", "sblaster", "gus", "speaker", "joystick", "serial", "dos", "ipx",
];

/// Fixed emit order; any other section follows alphabetically, `[autoexec]` last.
const SECTION_ORDER: [&str; 8] = ["sdl", "dosbox", "render", "cpu", "mixer", "midi", "sblaster", "gus"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Launch {
    pub version: u32,
    /// Entry used by the main Run button. Absent means `targets[0]`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<String>,
    pub targets: Vec<Target>,
    #[serde(default)]
    pub profiles: BTreeMap<String, Profile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Target {
    pub id: String,
    pub label: String,
    pub executable: String,
    #[serde(default)]
    pub arguments: Vec<String>,
    #[serde(default = "current_dir")]
    pub working_dir: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile: Option<String>,
    #[serde(default)]
    pub pre_commands: Vec<String>,
}

/// Closed schema: an unknown field (say `memory` instead of `memsize`) is an
/// error at import time, not a mystery at launch time. The only escape hatch is
/// `extra`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Profile {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub machine: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memsize: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cycles: Option<Cycles>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub core: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sound: Vec<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub extra: BTreeMap<String, String>,
}

/// `cycles` accepts an integer >= 1 or the strings `auto` / `max`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Cycles {
    Fixed(i64),
    Auto,
    Max,
}

impl Cycles {
    fn as_conf_value(&self) -> String {
        match self {
            Cycles::Fixed(value) => value.to_string(),
            Cycles::Auto => "auto".to_string(),
            Cycles::Max => "max".to_string(),
        }
    }
}

impl Serialize for Cycles {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Cycles::Fixed(value) => serializer.serialize_i64(*value),
            other => serializer.serialize_str(&other.as_conf_value()),
        }
    }
}

impl<'de> Deserialize<'de> for Cycles {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Raw {
            Int(i64),
            Float(f64),
            Text(String),
            Other(serde_json::Value),
        }

        match Raw::deserialize(deserializer)? {
            Raw::Int(value) if value >= 1 => Ok(Cycles::Fixed(value)),
            Raw::Int(value) => Err(de::Error::custom(format!(
                "cycles must be an integer >= 1, got {value}"
            ))),
            Raw::Float(value) => Err(de::Error::custom(format!(
                "cycles must be an integer, not a decimal ({value})"
            ))),
            Raw::Text(text) if text == "auto" => Ok(Cycles::Auto),
            Raw::Text(text) if text == "max" => Ok(Cycles::Max),
            Raw::Text(text) => Err(de::Error::custom(format!(
                "cycles accepts an integer >= 1, \"auto\" or \"max\", got \"{text}\""
            ))),
            Raw::Other(value) => Err(de::Error::custom(format!(
                "cycles accepts an integer >= 1, \"auto\" or \"max\" (got {value})"
            ))),
        }
    }
}

fn current_dir() -> String {
    ".".to_string()
}

/// Where "does this file exist" is answered from.
#[derive(Debug, Clone, Default)]
pub struct FileIndex {
    files: HashMap<String, String>,
    dirs: HashMap<String, String>,
}

impl FileIndex {
    /// Build from archive entry names (already `/`-separated).
    pub fn from_entries<I: IntoIterator<Item = String>>(entries: I) -> Self {
        let mut index = FileIndex::default();
        for entry in entries {
            index.insert(&entry);
            let mut parent = entry.as_str();
            while let Some((head, _)) = parent.rsplit_once('/') {
                index
                    .dirs
                    .entry(head.to_lowercase())
                    .or_insert_with(|| head.to_string());
                parent = head;
            }
        }
        index
    }

    /// Build by walking a directory. Used at launch time, on `installed/<id>/`.
    pub fn from_dir(root: &Path) -> Result<Self, String> {
        let mut index = FileIndex::default();
        for entry in walkdir::WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
            let rel = entry
                .path()
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            if rel.is_empty() {
                continue;
            }
            if entry.file_type().is_dir() {
                index.dirs.entry(rel.to_lowercase()).or_insert(rel);
            } else {
                index.insert(&rel);
            }
        }
        Ok(index)
    }

    fn insert(&mut self, path: &str) {
        self.files
            .entry(path.to_lowercase())
            .or_insert_with(|| path.to_string());
    }

    /// Case-insensitive lookup returning the real spelling, if known.
    pub fn file(&self, path: &str) -> Option<&str> {
        self.files.get(&path.to_lowercase()).map(String::as_str)
    }

    pub fn dir(&self, path: &str) -> Option<&str> {
        if path.is_empty() {
            return Some("");
        }
        self.dirs.get(&path.to_lowercase()).map(String::as_str)
    }

    pub fn is_empty(&self) -> bool {
        self.files.is_empty() && self.dirs.is_empty()
    }
}

/// Lexically resolve `rel` against `base`, both relative to `installed/<id>/`.
/// Returns `None` when the result escapes the root or is absolute.
pub fn normalize_rel(base: &str, rel: &str) -> Option<String> {
    if rel.starts_with('/') || rel.starts_with('\\') || rel.contains(':') {
        return None;
    }

    let mut parts: Vec<&str> = base
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .collect();

    for part in rel.split(['/', '\\']) {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            other => parts.push(other),
        }
    }

    Some(parts.join("/"))
}

impl Launch {
    pub fn from_bytes(bytes: &[u8]) -> Result<Launch, FieldError> {
        let value: serde_json::Value =
            serde_json::from_slice(bytes).map_err(|e| FieldError::new("launch.json", e.to_string()))?;

        match value.get("version").and_then(|v| v.as_i64()) {
            Some(version) if version == LAUNCH_VERSION as i64 => {}
            Some(version) => {
                return Err(FieldError::new(
                    "version",
                    format!("Unsupported launch.json version: {version}"),
                ))
            }
            None => return Err(FieldError::new("version", "must be 1")),
        }

        let mut de = serde_json::Deserializer::from_slice(bytes);
        let launch: Launch =
            serde_path_to_error::deserialize(&mut de).map_err(|e| error::from_serde("launch.json", &e))?;

        launch.validate_structure()?;
        Ok(launch)
    }

    /// Everything that does not need a file system: ids, labels, profiles,
    /// whitelists, path containment.
    pub fn validate_structure(&self) -> Result<(), FieldError> {
        if self.targets.is_empty() {
            return Err(FieldError::new("targets", "must contain at least one entry"));
        }

        let mut seen: HashMap<String, &str> = HashMap::new();
        for (index, target) in self.targets.iter().enumerate() {
            let path = format!("targets[{index}]");

            if !is_target_id(&target.id) {
                return Err(FieldError::new(
                    format!("{path}.id"),
                    "must match ^[a-z][a-z0-9_-]{0,31}$",
                ));
            }
            // Case-insensitive uniqueness: two ids that differ only by case are
            // impossible to tell apart on a case-insensitive file system.
            if let Some(previous) = seen.insert(target.id.to_lowercase(), &target.id) {
                return Err(FieldError::new(
                    format!("{path}.id"),
                    format!("duplicates \"{previous}\" (ids are case-insensitive)"),
                ));
            }

            let label = target.label.trim();
            if label.is_empty() || label.chars().count() > 40 {
                return Err(FieldError::new(format!("{path}.label"), "must be 1-40 characters"));
            }

            target.validate(&path)?;
        }

        if let Some(default) = &self.default {
            if !self.targets.iter().any(|t| &t.id == default) {
                return Err(FieldError::new(
                    "default",
                    format!("points at an unknown target: {default}"),
                ));
            }
        }

        for (name, profile) in &self.profiles {
            profile.validate(&format!("profiles.{name}")).map_err(|e| e)?;
        }

        Ok(())
    }

    /// Check the files referenced by `targets` exist. Called with a ZIP entry
    /// index at import (nothing extracted yet) and with a disk walk at launch.
    pub fn validate_files(&self, files: &FileIndex) -> Result<(), FieldError> {
        for (index, target) in self.targets.iter().enumerate() {
            let path = format!("targets[{index}]");

            let working = normalize_rel("Program", &target.working_dir)
                .ok_or_else(|| FieldError::new(format!("{path}.workingDir"), "escapes Program/"))?;
            if !working.starts_with("Program") {
                return Err(FieldError::new(format!("{path}.workingDir"), "escapes Program/"));
            }
            if files.dir(&working).is_none() {
                return Err(FieldError::new(
                    format!("{path}.workingDir"),
                    format!("directory not found: {working}"),
                ));
            }

            let executable = normalize_rel(&working, &target.executable)
                .ok_or_else(|| FieldError::new(format!("{path}.executable"), "escapes Program/"))?;
            if !executable.starts_with("Program/") {
                return Err(FieldError::new(format!("{path}.executable"), "escapes Program/"));
            }
            if files.file(&executable).is_none() {
                return Err(FieldError::new(
                    format!("{path}.executable"),
                    format!("file not found: {executable}"),
                ));
            }

            for (i, command) in target.pre_commands.iter().enumerate() {
                validate_pre_command(&working, command, files)
                    .map_err(|message| FieldError::new(format!("{path}.preCommands[{i}]"), message))?;
            }
        }
        Ok(())
    }

    /// The entry the main Run button uses: `default`, else `targets[0]`.
    pub fn default_target(&self) -> &Target {
        match &self.default {
            Some(id) => self
                .targets
                .iter()
                .find(|t| &t.id == id)
                .unwrap_or_else(|| &self.targets[0]),
            None => &self.targets[0],
        }
    }

    pub fn target(&self, id: Option<&str>) -> Result<&Target, FieldError> {
        match id {
            None => Ok(self.default_target()),
            Some(id) => self
                .targets
                .iter()
                .find(|t| t.id == id)
                .ok_or_else(|| FieldError::new("target", format!("unknown target: {id}"))),
        }
    }

    pub fn profile_of<'a>(&'a self, target: &'a Target) -> Option<(&'a str, &'a Profile)> {
        let name = target.profile.as_deref()?;
        self.profiles.get_key_value(name).map(|(k, v)| (k.as_str(), v))
    }

    /// Generate `Runtime/dosbox.conf`. Deterministic: same input, same bytes.
    pub fn render_conf(&self, files: &FileIndex, options: &ConfOptions<'_>) -> Result<Rendered, FieldError> {
        self.validate_structure()?;

        let target = self.target(options.target_id)?;
        let profile = self.profile_of(target);
        self.validate_files(files)?;
        let installed = options.installed_dir;
        let program_dir = installed.join("Program");

        let mut sections: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();

        // Base overrides: both DOSBox defaults are relative paths and would land
        // in the process working directory (Program/), polluting the install.
        insert(
            &mut sections,
            "sdl",
            "mapperfile",
            installed
                .join("Runtime")
                .join("mapper.map")
                .to_string_lossy()
                .to_string(),
        );
        insert(
            &mut sections,
            "dosbox",
            "captures",
            installed.join("Runtime").join("captures").to_string_lossy().to_string(),
        );

        if let Some((name, profile)) = profile {
            if let Some(machine) = &profile.machine {
                insert(&mut sections, "dosbox", "machine", machine.clone());
            }
            if let Some(memsize) = profile.memsize {
                insert(&mut sections, "dosbox", "memsize", memsize.to_string());
            }
            if let Some(cycles) = &profile.cycles {
                insert(&mut sections, "cpu", "cycles", cycles.as_conf_value());
            }
            if let Some(core) = &profile.core {
                insert(&mut sections, "cpu", "core", core.clone());
            }
            apply_sound(&mut sections, &profile.sound)
                .map_err(|message| FieldError::new(format!("profiles.{name}.sound"), message))?;

            for (key, value) in &profile.extra {
                let (section, key_name) = key.split_once('.').ok_or_else(|| {
                    FieldError::new(
                        format!("profiles.{name}.extra.{key}"),
                        "keys must be written as section.key",
                    )
                })?;
                if sections
                    .get(section)
                    .is_some_and(|values| values.contains_key(key_name))
                {
                    return Err(FieldError::new(
                        format!("profiles.{name}.extra.{key}"),
                        "collides with a first-class field",
                    ));
                }
                insert(&mut sections, section, key_name, value.clone());
            }
        }

        let mut autoexec = Vec::new();
        autoexec.push(format!(
            "MOUNT C \"{}\"",
            program_dir.to_string_lossy().replace('/', "\\")
        ));
        autoexec.push("C:".to_string());
        let working = normalize_rel("Program", &target.working_dir).unwrap_or_else(|| "Program".to_string());
        if working != "Program" {
            let relative = working.trim_start_matches("Program/");
            autoexec.push(format!("cd {}", quote(relative)));
        }
        autoexec.extend(target.pre_commands.iter().cloned());

        let mut command = quote(&target.executable);
        for argument in &target.arguments {
            command.push(' ');
            command.push_str(&quote(argument));
        }
        autoexec.push(command);

        let mut out = String::new();
        out.push_str(&format!(
            "# Generated by Retrium {} — 由 Config/launch.json 生成，请勿手工编辑\n",
            options.app_version
        ));
        out.push_str(&format!(
            "# DOSBox: {}   target={}   profile={}\n",
            options.dosbox_version.unwrap_or("unknown"),
            target.id,
            profile.map(|(name, _)| name).unwrap_or("-")
        ));
        out.push_str(
            "# 未列出的键取本机 DOSBox 内置默认值（0.74-3 参考值：machine=svga_s3 memsize=16 cycles=auto core=auto sbtype=sb16 ...）\n",
        );

        let mut emitted: Vec<&str> = SECTION_ORDER
            .iter()
            .copied()
            .filter(|name| sections.contains_key(*name))
            .collect();
        let mut rest: Vec<&str> = sections
            .keys()
            .map(String::as_str)
            .filter(|name| !SECTION_ORDER.contains(name))
            .collect();
        rest.sort_unstable();
        emitted.extend(rest);

        for name in emitted {
            let values = &sections[name];
            if values.is_empty() {
                continue;
            }
            out.push('\n');
            out.push_str(&format!("[{name}]\n"));
            for (key, value) in values {
                out.push_str(&format!("{key}={value}\n"));
            }
        }

        out.push('\n');
        out.push_str("[autoexec]\n");
        for line in autoexec {
            out.push_str(&line);
            out.push('\n');
        }

        Ok(Rendered {
            target_id: target.id.clone(),
            label: target.label.clone(),
            text: out,
        })
    }
}

impl Target {
    fn validate(&self, path: &str) -> Result<(), FieldError> {
        for (i, argument) in self.arguments.iter().enumerate() {
            if argument.chars().count() > 260 {
                return Err(FieldError::new(
                    format!("{path}.arguments[{i}]"),
                    "must be at most 260 characters",
                ));
            }
            if argument.contains('"') || argument.contains('\n') || argument.contains('\t') {
                return Err(FieldError::new(
                    format!("{path}.arguments[{i}]"),
                    "must not contain quotes, newlines or tabs (DOS has no escaping)",
                ));
            }
        }

        normalize_rel("Program", &self.working_dir)
            .ok_or_else(|| FieldError::new(format!("{path}.workingDir"), "must be a relative path inside Program/"))?;

        if self.executable.trim().is_empty() {
            return Err(FieldError::new(format!("{path}.executable"), "must not be empty"));
        }
        if normalize_rel("Program", &self.executable).is_none() {
            return Err(FieldError::new(
                format!("{path}.executable"),
                "must be a relative path inside Program/",
            ));
        }

        if self.pre_commands.len() > 16 {
            return Err(FieldError::new(
                format!("{path}.preCommands"),
                "must contain at most 16 entries",
            ));
        }

        Ok(())
    }
}

impl Profile {
    fn validate(&self, path: &str) -> Result<(), FieldError> {
        if let Some(machine) = &self.machine {
            if !MACHINES.contains(&machine.as_str()) {
                return Err(FieldError::new(
                    format!("{path}.machine"),
                    format!("must be one of {}", MACHINES.join(", ")),
                ));
            }
        }
        if let Some(memsize) = self.memsize {
            if !(1..=63).contains(&memsize) {
                return Err(FieldError::new(
                    format!("{path}.memsize"),
                    "must be between 1 and 63 (megabytes)",
                ));
            }
        }
        if let Some(core) = &self.core {
            if !CORES.contains(&core.as_str()) {
                return Err(FieldError::new(
                    format!("{path}.core"),
                    format!("must be one of {}", CORES.join(", ")),
                ));
            }
        }
        apply_sound(&mut BTreeMap::new(), &self.sound)
            .map_err(|message| FieldError::new(format!("{path}.sound"), message))?;

        for (key, value) in &self.extra {
            let (section, name) = key
                .split_once('.')
                .ok_or_else(|| FieldError::new(format!("{path}.extra.{key}"), "keys must be written as section.key"))?;
            if name.is_empty() {
                return Err(FieldError::new(
                    format!("{path}.extra.{key}"),
                    "is missing a key name after the dot",
                ));
            }
            if !EXTRA_SECTIONS.contains(&section) {
                return Err(FieldError::new(
                    format!("{path}.extra.{key}"),
                    format!("unknown section \"{section}\""),
                ));
            }
            if value.contains(['\n', '\r', '\0', '[', ']']) {
                return Err(FieldError::new(
                    format!("{path}.extra.{key}"),
                    "value must not contain newlines, NUL or brackets",
                ));
            }
        }

        Ok(())
    }
}

/// Map `sound` tokens onto `[sblaster]` / `[gus]` / `[mixer]`.
fn apply_sound(sections: &mut BTreeMap<String, BTreeMap<String, String>>, tokens: &[String]) -> Result<(), String> {
    let mut sb: Option<&str> = None;
    let mut gus = false;
    let mut none = false;

    for token in tokens {
        if SB_TYPES.contains(&token.as_str()) {
            if sb.is_some() {
                return Err(format!("\"{token}\" conflicts with another Sound Blaster type"));
            }
            sb = Some(token);
        } else if token == "gus" {
            gus = true;
        } else if token == "none" {
            none = true;
        } else {
            return Err(format!(
                "unknown token \"{token}\" (expected one of {} or gus, none)",
                SB_TYPES.join(", ")
            ));
        }
    }

    if none && (sb.is_some() || gus) {
        return Err("\"none\" cannot be combined with other tokens".to_string());
    }

    if let Some(sb) = sb {
        insert(sections, "sblaster", "sbtype", sb.to_string());
    }
    if gus {
        insert(sections, "gus", "gus", "true".to_string());
    }
    if none {
        insert(sections, "mixer", "nosound", "true".to_string());
    }
    Ok(())
}

fn insert(sections: &mut BTreeMap<String, BTreeMap<String, String>>, section: &str, key: &str, value: String) {
    sections
        .entry(section.to_string())
        .or_default()
        .insert(key.to_string(), value);
}

fn quote(value: &str) -> String {
    if value.contains(' ') {
        format!("\"{value}\"")
    } else {
        value.to_string()
    }
}

fn is_target_id(id: &str) -> bool {
    let bytes = id.as_bytes();
    if bytes.is_empty() || bytes.len() > 32 {
        return false;
    }
    if !bytes[0].is_ascii_lowercase() {
        return false;
    }
    bytes[1..]
        .iter()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'_' || *b == b'-')
}

/// Split a DOS command line, honouring double quotes.
fn tokenize(command: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quoted = false;

    for ch in command.chars() {
        match ch {
            '"' => quoted = !quoted,
            c if c.is_whitespace() && !quoted => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            c => current.push(c),
        }
    }
    if quoted {
        return Err("unbalanced quotes".to_string());
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    Ok(tokens)
}

fn validate_pre_command(working: &str, command: &str, files: &FileIndex) -> Result<(), String> {
    if command.contains(['|', '&', '>', '<']) {
        return Err("must not contain shell redirection or pipes".to_string());
    }

    let tokens = tokenize(command)?;
    let Some(head) = tokens.first() else {
        return Err("must not be empty".to_string());
    };

    match head.to_ascii_lowercase().as_str() {
        "cd" => {
            if tokens.len() != 2 {
                return Err("usage: cd <directory>".to_string());
            }
            let target = normalize_rel("Program", &tokens[1]).ok_or_else(|| "path escapes Program/".to_string())?;
            if !target.starts_with("Program") {
                return Err("path escapes Program/".to_string());
            }
            if files.dir(&target).is_none() {
                return Err(format!("directory not found: {target}"));
            }
            Ok(())
        }
        "loadfix" => {
            let (executable, has_flag) = match tokens.len() {
                2 => (tokens[1].as_str(), false),
                3 => (tokens[2].as_str(), true),
                _ => return Err("usage: loadfix [-1] <executable>".to_string()),
            };
            if has_flag && tokens[1] != "-1" {
                return Err("loadfix only accepts -1 as an option".to_string());
            }
            let resolved = normalize_rel(working, executable).ok_or_else(|| "path escapes Program/".to_string())?;
            if !resolved.starts_with("Program/") || files.file(&resolved).is_none() {
                return Err(format!("file not found in Program/: {executable}"));
            }
            Ok(())
        }
        "set" => {
            if tokens.len() != 2 {
                return Err("usage: set NAME=value".to_string());
            }
            let (name, value) = tokens[1]
                .split_once('=')
                .ok_or_else(|| "usage: set NAME=value".to_string())?;
            let name = name.to_ascii_uppercase();
            if name != "BLASTER" && name != "SOUND" {
                return Err("only BLASTER and SOUND can be set".to_string());
            }
            if value.contains([':', '\\', '/']) {
                return Err("value must not contain a drive or path".to_string());
            }
            Ok(())
        }
        "imgmount" => {
            if tokens.len() < 3 {
                return Err("usage: imgmount <drive> <file> [-t iso|cdrom|floppy]".to_string());
            }
            let drive = tokens[1].as_bytes();
            let valid_drive = (drive.len() == 1 && drive[0].is_ascii_alphabetic())
                || (drive.len() == 2 && drive[0].is_ascii_alphabetic() && drive[1] == b':');
            if !valid_drive {
                return Err("first argument must be a drive letter like D or D:".to_string());
            }
            let resolved = normalize_rel("Program", &tokens[2]).ok_or_else(|| "path escapes the cart".to_string())?;
            if !(resolved.starts_with("Program/") || resolved.starts_with("Resources/")) {
                return Err("file must live in Program/ or Resources/".to_string());
            }
            if files.file(&resolved).is_none() {
                return Err(format!("file not found: {resolved}"));
            }
            Ok(())
        }
        "mount" => Err("MOUNT is not allowed; Program/ is mounted automatically".to_string()),
        other => Err(format!("command not allowed: {other}")),
    }
}

pub struct ConfOptions<'a> {
    /// Absolute path of `installed/<id>/`.
    pub installed_dir: &'a Path,
    pub target_id: Option<&'a str>,
    /// Best-effort probe result, `None` renders as `unknown`.
    pub dosbox_version: Option<&'a str>,
    pub app_version: &'a str,
}

#[derive(Debug, Clone)]
pub struct Rendered {
    pub target_id: String,
    pub label: String,
    pub text: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> serde_json::Value {
        serde_json::json!({
            "version": 1,
            "default": "game",
            "targets": [
                { "id": "game",  "label": "主游戏",   "executable": "SAN486.COM", "arguments": [],   "workingDir": ".",     "profile": "svga-high" },
                { "id": "setup", "label": "声音设置", "executable": "SETUP.EXE",   "arguments": ["/s"], "workingDir": "SOUND", "profile": "minimal" },
                { "id": "cd",    "label": "光盘版",   "executable": "PLAY.BAT",    "arguments": [],
                  "preCommands": ["IMGMOUNT D \"../Resources/GAME.ISO\" -t iso"] }
            ],
            "profiles": {
                "svga-high": {
                    "machine": "svga_s3",
                    "memsize": 16,
                    "cycles": 3000,
                    "core": "normal",
                    "sound": ["sb16"],
                    "extra": { "render.scaler": "normal3x" }
                },
                "minimal": { "machine": "hercules", "memsize": 4, "cycles": "max" }
            }
        })
    }

    fn parse(value: &serde_json::Value) -> Result<Launch, FieldError> {
        Launch::from_bytes(serde_json::to_vec(value).unwrap().as_slice())
    }

    fn files() -> FileIndex {
        FileIndex::from_entries(vec![
            "Program/SAN486.COM".to_string(),
            "Program/SETUP.EXE".to_string(),
            "Program/SOUND/SETUP.EXE".to_string(),
            "Program/PLAY.BAT".to_string(),
            "Program/DATA/LEVEL.DAT".to_string(),
            "Resources/GAME.ISO".to_string(),
            "Config/launch.json".to_string(),
        ])
    }

    fn options() -> ConfOptions<'static> {
        ConfOptions {
            installed_dir: Path::new("C:\\Games\\Retrium\\installed\\019ae4c1"),
            target_id: Some("game"),
            dosbox_version: Some("0.74-3"),
            app_version: "0.3.0",
        }
    }

    #[test]
    fn accepts_the_documented_example() {
        parse(&sample()).unwrap();
    }

    #[test]
    fn default_falls_back_to_first_target() {
        let mut value = sample();
        value.as_object_mut().unwrap().remove("default");
        let launch = parse(&value).unwrap();
        assert_eq!(launch.default_target().id, "game");
    }

    #[test]
    fn rejects_default_pointing_nowhere() {
        let mut value = sample();
        value["default"] = serde_json::json!("missing");
        assert_eq!(parse(&value).unwrap_err().path, "default");
    }

    #[test]
    fn rejects_duplicate_ids_differing_only_by_case() {
        let mut value = sample();
        value["targets"][1]["id"] = serde_json::json!("GAME");
        let error = parse(&value).unwrap_err();
        assert_eq!(error.path, "targets[1].id");
    }

    #[test]
    fn rejects_bad_ids_and_labels() {
        for bad in ["Game", "1game", "game!", ""] {
            let mut value = sample();
            value["targets"][0]["id"] = serde_json::json!(bad);
            assert!(parse(&value).is_err(), "{bad}");
        }

        let mut value = sample();
        value["targets"][0]["label"] = serde_json::json!("   ");
        assert_eq!(parse(&value).unwrap_err().path, "targets[0].label");

        let mut value = sample();
        value["targets"][0]["label"] = serde_json::json!("x".repeat(41));
        assert_eq!(parse(&value).unwrap_err().path, "targets[0].label");
    }

    #[test]
    fn rejects_arguments_with_quotes_or_newlines() {
        let mut value = sample();
        value["targets"][0]["arguments"] = serde_json::json!(["/a\"b"]);
        assert_eq!(parse(&value).unwrap_err().path, "targets[0].arguments[0]");

        let mut value = sample();
        value["targets"][0]["arguments"] = serde_json::json!(["/a\nb"]);
        assert!(parse(&value).is_err());
    }

    #[test]
    fn rejects_closed_schema_violations() {
        let mut value = sample();
        value["profiles"]["minimal"]["memory"] = serde_json::json!(4);
        assert!(parse(&value).unwrap_err().path.contains("memory"));

        let mut value = sample();
        value["targets"][0]["argument"] = serde_json::json!(["typo"]);
        assert!(parse(&value).unwrap_err().path.contains("argument"));
    }

    #[test]
    fn rejects_out_of_range_profile_values() {
        let mut value = sample();
        value["profiles"]["minimal"]["memsize"] = serde_json::json!(640);
        assert_eq!(parse(&value).unwrap_err().path, "profiles.minimal.memsize");

        let mut value = sample();
        value["profiles"]["minimal"]["machine"] = serde_json::json!("amiga");
        assert_eq!(parse(&value).unwrap_err().path, "profiles.minimal.machine");

        let mut value = sample();
        value["profiles"]["minimal"]["core"] = serde_json::json!("fast");
        assert_eq!(parse(&value).unwrap_err().path, "profiles.minimal.core");
    }

    #[test]
    fn cycles_rejects_decimals_but_takes_integers_and_keywords() {
        let mut value = sample();
        value["profiles"]["minimal"]["cycles"] = serde_json::json!(3000.0);
        let error = parse(&value).unwrap_err();
        assert!(error.message.contains("decimal"), "{error}");

        let mut value = sample();
        value["profiles"]["minimal"]["cycles"] = serde_json::json!("fast");
        assert!(parse(&value).is_err());

        let mut value = sample();
        value["profiles"]["minimal"]["cycles"] = serde_json::json!(4000);
        let launch = parse(&value).unwrap();
        assert_eq!(launch.profiles["minimal"].cycles, Some(Cycles::Fixed(4000)));
    }

    #[test]
    fn sound_rules() {
        let mut value = sample();
        value["profiles"]["minimal"]["sound"] = serde_json::json!(["sb16", "sbpro2"]);
        assert_eq!(parse(&value).unwrap_err().path, "profiles.minimal.sound");

        let mut value = sample();
        value["profiles"]["minimal"]["sound"] = serde_json::json!(["none", "sb16"]);
        assert!(parse(&value).is_err());

        let mut value = sample();
        value["profiles"]["minimal"]["sound"] = serde_json::json!(["adlib"]);
        assert!(parse(&value).is_err());
    }

    #[test]
    fn extra_rules() {
        let mut value = sample();
        value["profiles"]["minimal"]["extra"] = serde_json::json!({ "render2.scaler": "x" });
        assert!(parse(&value).unwrap_err().path.contains("extra"));

        let mut value = sample();
        value["profiles"]["minimal"]["extra"] = serde_json::json!({ "render": "x" });
        assert!(parse(&value).is_err());
    }

    #[test]
    fn extra_values_may_not_contain_brackets() {
        let mut value = sample();
        value["profiles"]["minimal"]["extra"] = serde_json::json!({ "render.scaler": "normal3x[2]" });
        assert!(parse(&value).is_err());
    }

    #[test]
    fn resolves_paths_and_rejects_escapes() {
        let launch = parse(&sample()).unwrap();
        launch.validate_files(&files()).unwrap();

        let mut value = sample();
        value["targets"][0]["executable"] = serde_json::json!("../../etc/passwd");
        assert!(parse(&value).is_err());

        let mut value = sample();
        value["targets"][0]["workingDir"] = serde_json::json!("../..");
        assert!(parse(&value).is_err());
    }

    #[test]
    fn reports_missing_executable_with_field_path() {
        let launch = parse(&sample()).unwrap();
        let files = FileIndex::from_entries(vec![
            "Program/SETUP.EXE".to_string(),
            "Program/SOUND/SETUP.EXE".to_string(),
            "Program/PLAY.BAT".to_string(),
            "Resources/GAME.ISO".to_string(),
        ]);
        let error = launch.validate_files(&files).unwrap_err();
        assert_eq!(error.path, "targets[0].executable");
        assert!(error.message.contains("Program/SAN486.COM"));
    }

    #[test]
    fn normalizes_paths() {
        assert_eq!(normalize_rel("Program", ".").unwrap(), "Program");
        assert_eq!(normalize_rel("Program", "SOUND").unwrap(), "Program/SOUND");
        assert_eq!(
            normalize_rel("Program", "../Resources/GAME.ISO").unwrap(),
            "Resources/GAME.ISO"
        );
        assert_eq!(normalize_rel("Program", "..").unwrap(), "");
        assert!(normalize_rel("Program", "../../x").is_none());
        assert!(normalize_rel("Program", "C:\\DOS").is_none());
        assert!(normalize_rel("Program", "/etc/passwd").is_none());
    }

    #[test]
    fn renders_the_documented_conf() {
        let launch = parse(&sample()).unwrap();
        let rendered = launch.render_conf(&files(), &options()).expect("renders").text;

        let expected = "\
# Generated by Retrium 0.3.0 — 由 Config/launch.json 生成，请勿手工编辑
# DOSBox: 0.74-3   target=game   profile=svga-high
# 未列出的键取本机 DOSBox 内置默认值（0.74-3 参考值：machine=svga_s3 memsize=16 cycles=auto core=auto sbtype=sb16 ...）

[sdl]
mapperfile=C:\\Games\\Retrium\\installed\\019ae4c1\\Runtime\\mapper.map

[dosbox]
captures=C:\\Games\\Retrium\\installed\\019ae4c1\\Runtime\\captures
machine=svga_s3
memsize=16

[render]
scaler=normal3x

[cpu]
core=normal
cycles=3000

[sblaster]
sbtype=sb16

[autoexec]
MOUNT C \"C:\\Games\\Retrium\\installed\\019ae4c1\\Program\"
C:
SAN486.COM
";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn rendering_is_deterministic() {
        let launch = parse(&sample()).unwrap();
        let a = launch.render_conf(&files(), &options()).unwrap().text;
        let b = launch.render_conf(&files(), &options()).unwrap().text;
        assert_eq!(a, b);
    }

    #[test]
    fn target_without_profile_only_writes_base_overrides() {
        let launch = parse(&sample()).unwrap();
        let options = ConfOptions {
            target_id: Some("cd"),
            ..options()
        };
        let text = launch.render_conf(&files(), &options).unwrap().text;
        assert!(text.contains("[sdl]\nmapperfile="));
        assert!(!text.contains("[cpu]"));
        assert!(!text.contains("[sblaster]"));
        assert!(text.contains("IMGMOUNT D \"../Resources/GAME.ISO\" -t iso"));
        assert!(text.contains("PLAY.BAT"));
    }

    #[test]
    fn working_dir_emits_cd_and_quotes_paths_with_spaces() {
        let mut value = sample();
        value["targets"][1]["executable"] = serde_json::json!("SETUP.EXE");
        value["targets"][1]["arguments"] = serde_json::json!(["-d", "C:\\SAVE DIR"]);
        let launch = parse(&value).unwrap();
        let options = ConfOptions {
            target_id: Some("setup"),
            ..options()
        };
        let text = launch.render_conf(&files(), &options).unwrap().text;
        assert!(text.contains("C:\ncd SOUND\nSETUP.EXE -d \"C:\\SAVE DIR\"\n"));
    }

    #[test]
    fn unknown_target_is_an_error() {
        let launch = parse(&sample()).unwrap();
        let options = ConfOptions {
            target_id: Some("nope"),
            ..options()
        };
        let error = launch.render_conf(&files(), &options).unwrap_err();
        assert_eq!(error.path, "target");
    }

    #[test]
    fn pre_command_whitelist() {
        let files = files();
        assert!(validate_pre_command("Program", "cd DATA", &files).is_ok());
        assert!(validate_pre_command("Program", "loadfix -1 SAN486.COM", &files).is_ok());
        assert!(validate_pre_command("Program", "set BLASTER=A220", &files).is_ok());
        assert!(validate_pre_command("Program", "imgmount D \"../Resources/GAME.ISO\" -t iso", &files).is_ok());

        assert!(validate_pre_command("Program", "mount C /", &files).is_err());
        assert!(validate_pre_command("Program", "cd ..\\..", &files).is_err());
        assert!(validate_pre_command("Program", "set PATH=C:\\DOS", &files).is_err());
        assert!(validate_pre_command("Program", "imgmount D C:\\GAME.ISO", &files).is_err());
        assert!(validate_pre_command("Program", "del *.*", &files).is_err());
        assert!(validate_pre_command("Program", "cd DATA | more", &files).is_err());
        assert!(validate_pre_command("Program", "cd \"DATA", &files).is_err());
    }

    #[test]
    fn discovers_directories_from_entry_names() {
        let files = FileIndex::from_entries(vec![
            "Program/SOUND/SETUP.EXE".to_string(),
            "Resources/GAME.ISO".to_string(),
        ]);
        assert_eq!(files.dir("Program/SOUND"), Some("Program/SOUND"));
        assert_eq!(files.dir("program/sound"), Some("Program/SOUND"));
        assert_eq!(files.dir("Program"), Some("Program"));
        assert_eq!(files.dir("Program/MISSING"), None);
    }
}
