//! `manifest.json`: this cart's identity, revision and origin, plus the
//! metadata of the packaged program.
//!
//! The root `version` doubles as magic number and format version: missing or
//! non-integer means "not a Retrium cart", any integer other than 1 means
//! "a version this build cannot read". It is unrelated to `cart.revision`,
//! which is the author-controlled version of *this* cart.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::error::{self, FieldError};

pub const MANIFEST_VERSION: u32 = 1;

/// Categories are a closed set: fine-grained classification belongs in `tags`.
pub const CATEGORIES: [&str; 8] = [
    "game",
    "application",
    "utility",
    "education",
    "demo",
    "development",
    "system",
    "reference",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub cart: CartBlock,
    pub program: ProgramBlock,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CartBlock {
    pub id: String,
    pub revision: i64,
    /// Optional as a whole: most personal carts carry no signature.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<Author>,
    pub tool: Tool,
    /// When this revision was built, not when the cart was first created.
    pub created_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Author {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Tool {
    pub app: String,
    pub version: String,
    pub host: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgramBlock {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub developer: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub publisher: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub series: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub players: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dos: Option<Dos>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_ids: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Dos {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input: Option<Vec<String>>,
}

impl Manifest {
    /// Parse and validate, in that order. Unknown root-level keys are ignored
    /// on purpose so an author can leave a `"//"` comment.
    pub fn from_bytes(bytes: &[u8]) -> Result<Manifest, FieldError> {
        let value: serde_json::Value =
            serde_json::from_slice(bytes).map_err(|_| FieldError::new("manifest.json", "Not a Retrium cart"))?;

        match value.get("version").and_then(|v| v.as_i64()) {
            Some(version) if version == MANIFEST_VERSION as i64 => {}
            Some(version) => {
                return Err(FieldError::new(
                    "version",
                    format!("Unsupported cart version: {version}"),
                ))
            }
            None => return Err(FieldError::new("version", "Not a Retrium cart")),
        }

        let mut de = serde_json::Deserializer::from_slice(bytes);
        let manifest: Manifest =
            serde_path_to_error::deserialize(&mut de).map_err(|e| error::from_serde("manifest.json", &e))?;
        manifest.validate()?;
        Ok(manifest)
    }

    pub fn validate(&self) -> Result<(), FieldError> {
        self.cart.validate()?;
        self.program.validate()?;
        Ok(())
    }

    /// Deterministic pretty JSON. Field order follows the struct declaration.
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).expect("manifest serializes")
    }
}

impl CartBlock {
    fn validate(&self) -> Result<(), FieldError> {
        let path = "cart.id";
        let uuid = uuid::Uuid::parse_str(&self.id).map_err(|_| FieldError::new(path, "must be a UUID"))?;
        if uuid.to_string() != self.id {
            return Err(FieldError::new(path, "must be a canonical lowercase hyphenated UUID"));
        }

        if self.revision < 1 {
            return Err(FieldError::new("cart.revision", "must be >= 1"));
        }

        for (key, value) in [
            ("cart.tool.app", &self.tool.app),
            ("cart.tool.version", &self.tool.version),
            ("cart.tool.host", &self.tool.host),
        ] {
            if value.trim().is_empty() {
                return Err(FieldError::new(key, "must not be empty"));
            }
        }

        if chrono::DateTime::parse_from_rfc3339(&self.created_at).is_err() {
            return Err(FieldError::new("cart.createdAt", "must be an ISO 8601 timestamp"));
        }

        if let Some(author) = &self.author {
            if author.name.trim().is_empty() {
                return Err(FieldError::new("cart.author.name", "must not be empty"));
            }
            if let Some(email) = &author.email {
                if !is_email(email) {
                    return Err(FieldError::new("cart.author.email", "is not an email"));
                }
            }
        }

        Ok(())
    }
}

impl ProgramBlock {
    fn validate(&self) -> Result<(), FieldError> {
        if self.name.trim().is_empty() {
            return Err(FieldError::new("program.name", "must not be empty"));
        }
        if let Some(language) = &self.language {
            if !is_language_tag(language) {
                return Err(FieldError::new("program.language", "must be a BCP 47 language tag"));
            }
        }
        if let Some(category) = &self.category {
            if !CATEGORIES.contains(&category.as_str()) {
                return Err(FieldError::new(
                    "program.category",
                    format!("must be one of {}", CATEGORIES.join(", ")),
                ));
            }
        }
        if let Some(ids) = &self.external_ids {
            for key in ids.keys() {
                let valid = !key.is_empty()
                    && key
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_');
                if !valid {
                    return Err(FieldError::new(
                        format!("program.externalIds.{key}"),
                        "keys must be lowercase",
                    ));
                }
            }
        }
        Ok(())
    }
}

fn is_email(value: &str) -> bool {
    if value.chars().any(char::is_whitespace) {
        return false;
    }
    let mut parts = value.split('@');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(local), Some(domain), None) => {
            !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
        }
        _ => false,
    }
}

/// Syntax-only BCP 47 check: primary subtag 2–8 letters, then 1–8 alphanumerics.
/// Any well-formed tag is accepted, so new languages need no code change.
fn is_language_tag(value: &str) -> bool {
    let mut parts = value.split('-');
    let Some(primary) = parts.next() else {
        return false;
    };
    if !(2..=8).contains(&primary.len()) || !primary.bytes().all(|b| b.is_ascii_alphabetic()) {
        return false;
    }
    parts.all(|part| (1..=8).contains(&part.len()) && part.bytes().all(|b| b.is_ascii_alphanumeric()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid() -> serde_json::Value {
        serde_json::json!({
            "version": 1,
            "cart": {
                "id": "019ae4c1-2f3b-7c4d-8e9f-0a1b2c3d4e5f",
                "revision": 3,
                "author": { "name": "Garrett He", "email": "garrett@example.com" },
                "tool": { "app": "Retrium", "version": "0.3.0", "host": "windows-x86_64" },
                "createdAt": "2026-11-20T13:00:00Z"
            },
            "program": {
                "name": "三國志4威力加強版",
                "language": "zh-Hant",
                "release": 1994,
                "category": "game",
                "developer": "KOEI",
                "publisher": "KOEI",
                "series": null,
                "tags": ["Strategy", "DOS"],
                "players": 1,
                "platform": "IBM PC DOS",
                "dos": { "version": "6.22", "input": ["keyboard", "mouse"] },
                "externalIds": { "mobygames": "12345", "igdb": "67890" }
            }
        })
    }

    fn parse(value: &serde_json::Value) -> Result<Manifest, FieldError> {
        Manifest::from_bytes(serde_json::to_vec(value).unwrap().as_slice())
    }

    #[test]
    fn accepts_a_full_manifest_and_roundtrips() {
        let manifest = parse(&valid()).unwrap();
        assert_eq!(manifest.cart.revision, 3);
        assert_eq!(manifest.program.players, Some(1));
        let again = Manifest::from_bytes(manifest.to_json().as_bytes()).unwrap();
        assert_eq!(again.to_json(), manifest.to_json());
    }

    #[test]
    fn author_is_optional() {
        let mut value = valid();
        value["cart"].as_object_mut().unwrap().remove("author");
        let manifest = parse(&value).unwrap();
        assert!(manifest.cart.author.is_none());
        assert!(!manifest.to_json().contains("author"));
    }

    #[test]
    fn rejects_blank_author_name() {
        let mut value = valid();
        value["cart"]["author"]["name"] = serde_json::json!("   ");
        let error = parse(&value).unwrap_err();
        assert_eq!(error.path, "cart.author.name");
    }

    #[test]
    fn rejects_bad_email() {
        let mut value = valid();
        value["cart"]["author"]["email"] = serde_json::json!("nope");
        let error = parse(&value).unwrap_err();
        assert_eq!(error.path, "cart.author.email");
    }

    #[test]
    fn distinguishes_missing_version_from_unsupported_one() {
        let mut missing = valid();
        missing.as_object_mut().unwrap().remove("version");
        assert_eq!(parse(&missing).unwrap_err().message, "Not a Retrium cart");

        let mut wrong = valid();
        wrong["version"] = serde_json::json!(2);
        assert_eq!(parse(&wrong).unwrap_err().message, "Unsupported cart version: 2");

        let mut not_int = valid();
        not_int["version"] = serde_json::json!("1");
        assert_eq!(parse(&not_int).unwrap_err().message, "Not a Retrium cart");
    }

    #[test]
    fn rejects_non_uuid_and_non_canonical_ids() {
        let mut value = valid();
        value["cart"]["id"] = serde_json::json!("not-a-uuid");
        assert_eq!(parse(&value).unwrap_err().path, "cart.id");

        let mut upper = valid();
        upper["cart"]["id"] = serde_json::json!("019AE4C1-2F3B-7C4D-8E9F-0A1B2C3D4E5F");
        assert_eq!(parse(&upper).unwrap_err().path, "cart.id");
    }

    #[test]
    fn rejects_zero_revision_and_bad_timestamp() {
        let mut value = valid();
        value["cart"]["revision"] = serde_json::json!(0);
        assert_eq!(parse(&value).unwrap_err().path, "cart.revision");

        let mut value = valid();
        value["cart"]["createdAt"] = serde_json::json!("yesterday");
        assert_eq!(parse(&value).unwrap_err().path, "cart.createdAt");
    }

    #[test]
    fn rejects_unknown_category_and_bad_language() {
        let mut value = valid();
        value["program"]["category"] = serde_json::json!("videogame");
        assert_eq!(parse(&value).unwrap_err().path, "program.category");

        let mut value = valid();
        value["program"]["language"] = serde_json::json!("Traditional Chinese");
        assert_eq!(parse(&value).unwrap_err().path, "program.language");
    }

    #[test]
    fn accepts_any_well_formed_language_tag() {
        for tag in ["zh-Hant", "en", "pt-BR", "ja", "sr-Latn-RS"] {
            assert!(is_language_tag(tag), "{tag}");
        }
        for tag in ["", "x", "zh_Hant", "zh-Hant-", "english language"] {
            assert!(!is_language_tag(tag), "{tag}");
        }
    }

    #[test]
    fn ignores_unknown_root_keys() {
        let mut value = valid();
        value["//"] = serde_json::json!("a comment");
        assert!(parse(&value).is_ok());
    }

    #[test]
    fn reports_the_offending_program_field() {
        let mut value = valid();
        value["program"].as_object_mut().unwrap().remove("name");
        let error = parse(&value).unwrap_err();
        assert!(error.path.starts_with("manifest.json.program"), "{error}");
    }
}
