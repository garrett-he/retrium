//! A validation failure that names the exact field it came from.
//!
//! Cart authors hand-edit `launch.json` and `manifest.json`, so every rejection
//! has to be actionable: `targets[1].executable: file not found` rather than
//! `invalid config`. Paths use the JSON notation the author sees.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FieldError {
    pub path: String,
    pub message: String,
}

impl FieldError {
    pub fn new(path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            message: message.into(),
        }
    }
}

impl std::fmt::Display for FieldError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.path.is_empty() {
            write!(f, "{}", self.message)
        } else {
            write!(f, "{}: {}", self.path, self.message)
        }
    }
}

impl std::error::Error for FieldError {}

/// Flatten a list of failures into one line: `a: x; b: y`.
pub fn join(errors: &[FieldError]) -> String {
    errors.iter().map(|e| e.to_string()).collect::<Vec<_>>().join("; ")
}

/// Adapt a `serde_path_to_error` failure into a field-scoped error.
pub fn from_serde(path: &str, error: &serde_path_to_error::Error<serde_json::Error>) -> FieldError {
    let inner = error.path().to_string();
    let path = if inner.is_empty() || inner == "." {
        path.to_string()
    } else {
        format!("{path}.{inner}")
    };
    FieldError::new(path, error.inner().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_path_and_message() {
        let error = FieldError::new("targets[1].executable", "file not found");
        assert_eq!(error.to_string(), "targets[1].executable: file not found");
    }

    #[test]
    fn joins_multiple_errors() {
        let errors = vec![FieldError::new("a", "one"), FieldError::new("b", "two")];
        assert_eq!(join(&errors), "a: one; b: two");
    }
}
