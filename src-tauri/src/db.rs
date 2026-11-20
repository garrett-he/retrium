//! SQLite index over `carts/*.cart`.
//!
//! The database is an index, not a source of truth: the archives are. If the
//! schema version does not match, the tables are dropped and rebuilt from
//! `carts/` plus each cart's `Runtime/commit.json`. That is why no migration
//! code exists here — see the design document, §0.1 / §4.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use crate::manifest::{Dos, Manifest, ProgramBlock, Tool};

pub const SCHEMA_VERSION: i64 = 1;

/// Idempotent on purpose: `prepare` runs it on every open, not only when the
/// version changed, so a database whose tables were dropped by hand comes back
/// instead of failing at the first query. `user_version` decides whether the
/// tables are *replaced*, never whether they may be created.
const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS carts (
    id               TEXT PRIMARY KEY,
    revision         INTEGER NOT NULL,
    package_hash     TEXT NOT NULL,
    manifest_version INTEGER NOT NULL,
    author_name      TEXT,
    author_email     TEXT,
    name             TEXT NOT NULL,
    language         TEXT,
    release          INTEGER,
    category         TEXT,
    developer        TEXT,
    publisher        TEXT,
    series           TEXT,
    tags             TEXT,
    platform         TEXT,
    players          INTEGER,
    dos_json         TEXT,
    external_json    TEXT,
    tool_json        TEXT,
    created_at       TEXT,
    raw_path         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_carts_package_hash ON carts(package_hash);
CREATE INDEX IF NOT EXISTS idx_carts_author       ON carts(author_name);
CREATE INDEX IF NOT EXISTS idx_carts_category     ON carts(category);
CREATE INDEX IF NOT EXISTS idx_carts_language     ON carts(language);
CREATE INDEX IF NOT EXISTS idx_carts_release      ON carts(release);

CREATE TABLE IF NOT EXISTS summaries (
    cart_id   TEXT PRIMARY KEY,
    last_run  TEXT NOT NULL,
    runs      INTEGER NOT NULL,
    elapsed   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_summaries_last_run ON summaries(last_run);
"#;

/// One cart as stored: the manifest it was written with, plus where the
/// archive lives relative to the library root.
#[derive(Debug, Clone)]
pub struct CartRecord {
    pub manifest: Manifest,
    pub package_hash: String,
    pub raw_path: String,
}

#[derive(Debug, Clone, Default)]
pub struct Summary {
    pub last_run: String,
    pub runs: i64,
    pub elapsed: i64,
}

/// What the UI needs about a cart: the record plus the revision/hash pair used
/// for dirty detection. Kept separate so `list` stays one query per table.
#[derive(Debug, Clone)]
pub struct CartEntry {
    pub record: CartRecord,
    pub summary: Option<Summary>,
}

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn open(library: &Path) -> Result<Db, String> {
        let path = library.join("retrium.db");
        let conn = Connection::open(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        Self::prepare(conn)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Db, String> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        Self::prepare(conn)
    }

    fn prepare(conn: Connection) -> Result<Db, String> {
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        if version != SCHEMA_VERSION {
            // No migration. Drop and rebuild; the archives can repopulate it.
            conn.execute_batch("DROP TABLE IF EXISTS carts; DROP TABLE IF EXISTS summaries;")
                .map_err(|e| e.to_string())?;
        }

        // Idempotent, so this is safe whether the tables were just dropped or
        // are already there from the previous run.
        conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        conn.pragma_update(None, "user_version", SCHEMA_VERSION)
            .map_err(|e| e.to_string())?;

        Ok(Db { conn })
    }

    pub fn upsert(&self, record: &CartRecord) -> Result<(), String> {
        let manifest = &record.manifest;
        let cart = &manifest.cart;
        let program = &manifest.program;

        self.conn
            .execute(
                "INSERT INTO carts (
                    id, revision, package_hash, manifest_version,
                    author_name, author_email,
                    name, language, release, category, developer, publisher, series,
                    tags, platform, players, dos_json, external_json, tool_json,
                    created_at, raw_path
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
                 ON CONFLICT(id) DO UPDATE SET
                    revision = excluded.revision,
                    package_hash = excluded.package_hash,
                    manifest_version = excluded.manifest_version,
                    author_name = excluded.author_name,
                    author_email = excluded.author_email,
                    name = excluded.name,
                    language = excluded.language,
                    release = excluded.release,
                    category = excluded.category,
                    developer = excluded.developer,
                    publisher = excluded.publisher,
                    series = excluded.series,
                    tags = excluded.tags,
                    platform = excluded.platform,
                    players = excluded.players,
                    dos_json = excluded.dos_json,
                    external_json = excluded.external_json,
                    tool_json = excluded.tool_json,
                    created_at = excluded.created_at,
                    raw_path = excluded.raw_path",
                params![
                    cart.id,
                    cart.revision,
                    record.package_hash,
                    manifest.version,
                    cart.author.as_ref().map(|a| a.name.clone()),
                    cart.author.as_ref().and_then(|a| a.email.clone()),
                    program.name,
                    program.language,
                    program.release,
                    program.category,
                    program.developer,
                    program.publisher,
                    program.series,
                    maybe_json(&program.tags)?,
                    program.platform,
                    program.players,
                    maybe_json(&program.dos)?,
                    maybe_json(&program.external_ids)?,
                    to_json(&cart.tool)?,
                    cart.created_at,
                    record.raw_path,
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> Result<Option<CartRecord>, String> {
        self.conn
            .query_row("SELECT * FROM carts WHERE id = ?1", params![id], map_record)
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn list(&self) -> Result<Vec<CartRecord>, String> {
        let mut statement = self
            .conn
            .prepare("SELECT * FROM carts ORDER BY name COLLATE NOCASE, id")
            .map_err(|e| e.to_string())?;
        let rows = statement.query_map([], map_record).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM carts WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        self.conn
            .execute("DELETE FROM summaries WHERE cart_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Another cart carrying exactly the same content, if any.
    pub fn find_by_hash(&self, hash: &str, except: &str) -> Result<Option<String>, String> {
        self.conn
            .query_row(
                "SELECT id FROM carts WHERE package_hash = ?1 AND id <> ?2 LIMIT 1",
                params![hash, except],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn ids(&self) -> Result<Vec<String>, String> {
        let mut statement = self.conn.prepare("SELECT id FROM carts").map_err(|e| e.to_string())?;
        let rows = statement.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    /// Rewrite the commit metadata after an export.
    pub fn set_commit(
        &self,
        id: &str,
        revision: i64,
        package_hash: &str,
        tool: &Tool,
        created_at: &str,
    ) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE carts SET revision = ?2, package_hash = ?3, tool_json = ?4, created_at = ?5 WHERE id = ?1",
                params![id, revision, package_hash, to_json(tool)?, created_at],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_summary(&self, id: &str, summary: &Summary) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO summaries (cart_id, last_run, runs, elapsed) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(cart_id) DO UPDATE SET
                    last_run = excluded.last_run,
                    runs = excluded.runs,
                    elapsed = excluded.elapsed",
                params![id, summary.last_run, summary.runs, summary.elapsed],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_summary(&self, id: &str) -> Result<Option<Summary>, String> {
        self.conn
            .query_row(
                "SELECT last_run, runs, elapsed FROM summaries WHERE cart_id = ?1",
                params![id],
                |row| {
                    Ok(Summary {
                        last_run: row.get(0)?,
                        runs: row.get(1)?,
                        elapsed: row.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn summaries(&self) -> Result<Vec<(String, Summary)>, String> {
        let mut statement = self
            .conn
            .prepare("SELECT cart_id, last_run, runs, elapsed FROM summaries")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    Summary {
                        last_run: row.get(1)?,
                        runs: row.get(2)?,
                        elapsed: row.get(3)?,
                    },
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }
}

fn to_json<T: serde::Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|e| e.to_string())
}

fn maybe_json<T: serde::Serialize>(value: &Option<T>) -> Result<Option<String>, String> {
    match value {
        Some(value) => serde_json::to_string(value).map(Some).map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

fn from_json<T: serde::de::DeserializeOwned>(value: Option<String>) -> Result<Option<T>, String> {
    match value {
        Some(text) => serde_json::from_str(&text).map(Some).map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

/// Surface a JSON column failure as a rusqlite error so it can be `?`-ed inside
/// a row mapper.
fn sql_error(message: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, message)),
    )
}

fn map_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<CartRecord> {
    let tool_json: Option<String> = row.get("tool_json")?;
    let tool: Tool = tool_json
        .as_deref()
        .and_then(|text| serde_json::from_str(text).ok())
        .unwrap_or_default();

    let author_name: Option<String> = row.get("author_name")?;
    let author_email: Option<String> = row.get("author_email")?;

    Ok(CartRecord {
        manifest: Manifest {
            version: row.get("manifest_version")?,
            cart: crate::manifest::CartBlock {
                id: row.get("id")?,
                revision: row.get("revision")?,
                author: author_name.map(|name| crate::manifest::Author {
                    name,
                    email: author_email,
                }),
                tool,
                created_at: row.get("created_at")?,
            },
            program: ProgramBlock {
                name: row.get("name")?,
                language: row.get("language")?,
                release: row.get("release")?,
                category: row.get("category")?,
                developer: row.get("developer")?,
                publisher: row.get("publisher")?,
                series: row.get("series")?,
                tags: from_json(row.get("tags")?).map_err(sql_error)?,
                players: row.get("players")?,
                platform: row.get("platform")?,
                dos: from_json::<Dos>(row.get("dos_json")?).map_err(sql_error)?,
                external_ids: from_json(row.get("external_json")?).map_err(sql_error)?,
            },
        },
        package_hash: row.get("package_hash")?,
        raw_path: row.get("raw_path")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::{Author, CartBlock, ProgramBlock};

    fn record(id: &str, name: &str, hash: &str) -> CartRecord {
        CartRecord {
            manifest: Manifest {
                version: 1,
                cart: CartBlock {
                    id: id.to_string(),
                    revision: 2,
                    author: Some(Author {
                        name: "Garrett".to_string(),
                        email: None,
                    }),
                    tool: Tool {
                        app: "Retrium".to_string(),
                        version: "0.3.0".to_string(),
                        host: "linux-x86_64".to_string(),
                    },
                    created_at: "2026-11-20T13:00:00Z".to_string(),
                },
                program: ProgramBlock {
                    name: name.to_string(),
                    language: Some("zh-Hant".to_string()),
                    release: Some(1994),
                    category: Some("game".to_string()),
                    tags: Some(vec!["Strategy".to_string()]),
                    players: Some(1),
                    dos: Some(Dos {
                        version: Some("6.22".to_string()),
                        input: Some(vec!["keyboard".to_string()]),
                    }),
                    ..ProgramBlock::default()
                },
            },
            package_hash: hash.to_string(),
            raw_path: format!("carts/{id}.cart"),
        }
    }

    #[test]
    fn roundtrips_every_column() {
        let db = Db::open_in_memory().unwrap();
        let original = record("019ae4c1-2f3b-7c4d-8e9f-0a1b2c3d4e5f", "Doom", "abc");
        db.upsert(&original).unwrap();

        let loaded = db.get(&original.manifest.cart.id).unwrap().unwrap();
        assert_eq!(loaded.manifest.program.name, "Doom");
        assert_eq!(loaded.manifest.program.release, Some(1994));
        assert_eq!(loaded.manifest.program.tags, Some(vec!["Strategy".to_string()]));
        assert_eq!(
            loaded.manifest.program.dos.unwrap().input,
            Some(vec!["keyboard".to_string()])
        );
        assert_eq!(loaded.manifest.cart.author.unwrap().name, "Garrett");
        assert_eq!(loaded.package_hash, "abc");
        assert_eq!(loaded.raw_path, "carts/019ae4c1-2f3b-7c4d-8e9f-0a1b2c3d4e5f.cart");
    }

    #[test]
    fn upsert_replaces_and_list_is_sorted() {
        let db = Db::open_in_memory().unwrap();
        db.upsert(&record("a", "zeta", "1")).unwrap();
        db.upsert(&record("b", "Alpha", "2")).unwrap();
        db.upsert(&record("a", "zeta", "3")).unwrap();

        let list = db.list().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].manifest.program.name, "Alpha");
        assert_eq!(list[1].package_hash, "3");
    }

    #[test]
    fn finds_duplicate_content_excluding_self() {
        let db = Db::open_in_memory().unwrap();
        db.upsert(&record("a", "one", "same")).unwrap();
        db.upsert(&record("b", "two", "same")).unwrap();
        assert_eq!(db.find_by_hash("same", "a").unwrap(), Some("b".to_string()));
        assert_eq!(db.find_by_hash("same", "c").unwrap(), Some("a".to_string()));
        assert_eq!(db.find_by_hash("other", "a").unwrap(), None);
    }

    #[test]
    fn summaries_upsert() {
        let db = Db::open_in_memory().unwrap();
        db.set_summary(
            "a",
            &Summary {
                last_run: "2026-11-20T13:00:00Z".to_string(),
                runs: 1,
                elapsed: 60,
            },
        )
        .unwrap();
        db.set_summary(
            "a",
            &Summary {
                last_run: "2026-11-21T13:00:00Z".to_string(),
                runs: 2,
                elapsed: 120,
            },
        )
        .unwrap();

        let summary = db.get_summary("a").unwrap().unwrap();
        assert_eq!(summary.runs, 2);
        assert_eq!(db.summaries().unwrap().len(), 1);
    }

    /// The index is opened once per process, so the second launch of the app is
    /// the first time `prepare` ever sees an existing schema version. It must
    /// not try to create the tables again.
    #[test]
    fn reopens_an_existing_database_without_recreating_tables() {
        let dir = std::env::temp_dir().join(format!(
            "retrium-db-reopen-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        {
            let db = Db::open(&dir).unwrap();
            db.upsert(&record("a", "one", "1")).unwrap();
        }
        let db = Db::open(&dir).unwrap();
        assert_eq!(db.list().unwrap().len(), 1);
        drop(db);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rebuilds_when_schema_version_changes() {
        let db = Db::open_in_memory().unwrap();
        db.upsert(&record("a", "one", "1")).unwrap();
        db.conn.pragma_update(None, "user_version", 99).unwrap();
        drop(db);

        // Same connection would have been re-prepared in `open`; emulate that.
        let conn = Connection::open_in_memory().unwrap();
        let db = Db::prepare(conn).unwrap();
        assert!(db.list().unwrap().is_empty());
    }

    #[test]
    fn delete_removes_row_and_summary() {
        let db = Db::open_in_memory().unwrap();
        db.upsert(&record("a", "one", "1")).unwrap();
        db.set_summary("a", &Summary::default()).unwrap();
        db.delete("a").unwrap();
        assert!(db.get("a").unwrap().is_none());
        assert!(db.get_summary("a").unwrap().is_none());
    }
}
