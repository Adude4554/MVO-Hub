//! SQLite persistence for cloud saves and the upload queue.
//!
//! Shares `gamevault.db` with the rest of the app so there is still exactly one
//! database file per install. Every table is created with `IF NOT EXISTS`, so
//! opening an existing v0.2.x database upgrades it in place.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use super::{now_iso, SaveState};

/// A tracked save file for one game.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSaveRecord {
    pub id: i64,
    pub game_id: String,
    pub game_name: String,
    /// Absolute path of the local save file.
    pub local_path: String,
    /// SHA-256 of the local file as of the last scan.
    pub local_hash: String,
    /// SHA-256 of the remote copy as of the last successful sync.
    pub remote_hash: Option<String>,
    /// Modified time of the local file (epoch millis).
    pub local_modified_ms: i64,
    pub local_size_bytes: i64,
    /// Hash at the moment of the last successful sync; the common ancestor.
    pub synced_hash: Option<String>,
    pub synced_at: Option<String>,
    pub updated_at: String,
}

impl CloudSaveRecord {
    /// Compare the current local hash against what we last synced and what the
    /// remote holds.
    ///
    /// The three-way comparison is what makes conflict detection correct: a
    /// naive "local != remote" check reports a conflict every time the two
    /// legitimately agree but differ from an older marker.
    pub fn state(&self, remote_hash: Option<&str>) -> SaveState {
        let local = self.local_hash.as_str();
        let remote = remote_hash.or(self.remote_hash.as_deref());
        let Some(remote) = remote else {
            return if self.synced_at.is_some() {
                SaveState::InSync
            } else {
                SaveState::Never
            };
        };

        let local_changed = local != remote;
        if !local_changed {
            return SaveState::InSync;
        }

        match self.synced_hash.as_deref() {
            // Never synced before: remote is authoritative only if it exists,
            // but with no common ancestor we cannot prove divergence. Treat a
            // pre-existing remote as the base so the first sync downloads.
            None => SaveState::RemoteAhead,
            Some(base) => {
                let local_ahead = local != base;
                let remote_ahead = remote != base;
                match (local_ahead, remote_ahead) {
                    (true, true) => SaveState::Conflict,
                    (true, false) => SaveState::LocalAhead,
                    (false, true) => SaveState::RemoteAhead,
                    (false, false) => SaveState::InSync,
                }
            }
        }
    }
}

/// A detected divergence that requires an explicit choice.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConflict {
    pub save: CloudSaveRecord,
    pub remote_hash: String,
    pub local_modified_ms: i64,
    /// Human-readable summary surfaced in the UI.
    pub message: String,
}

/// The user's decision about a conflict.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictResolution {
    KeepLocal,
    KeepRemote,
    KeepBoth,
}

impl ConflictResolution {
    /// The hash recorded as the new common ancestor after resolving.
    pub fn resolved_hash<'a>(self, local: &'a str, remote: &'a str) -> &'a str {
        match self {
            ConflictResolution::KeepLocal => local,
            ConflictResolution::KeepRemote => remote,
            // Both copies are retained; the synced one becomes the local copy.
            ConflictResolution::KeepBoth => local,
        }
    }
}

pub struct CloudDb {
    conn: Arc<Mutex<Connection>>,
}

impl std::fmt::Debug for CloudDb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CloudDb").finish_non_exhaustive()
    }
}

impl CloudDb {
    /// Open (or create) the cloud tables inside `<app_data_dir>/gamevault.db`.
    pub fn open(app_data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
        let conn = Connection::open(app_data_dir.join("gamevault.db")).map_err(|e| e.to_string())?;
        Self::from_connection(conn)
    }

    /// In-memory database, used by the test suite.
    pub fn in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        Self::from_connection(conn)
    }

    fn from_connection(conn: Connection) -> Result<Self, String> {
        conn.pragma_update(None, "journal_mode", "WAL").map_err(|e| e.to_string())?;
        conn.busy_timeout(std::time::Duration::from_millis(5000))
            .map_err(|e| e.to_string())?;
        conn.pragma_update(None, "foreign_keys", "ON").map_err(|e| e.to_string())?;
        Self::migrate(&conn)?;
        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }

    fn migrate(conn: &Connection) -> Result<(), String> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS cloud_saves (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id TEXT NOT NULL,
                game_name TEXT NOT NULL,
                local_path TEXT NOT NULL,
                local_hash TEXT NOT NULL,
                remote_hash TEXT,
                local_modified_ms INTEGER NOT NULL DEFAULT 0,
                local_size_bytes INTEGER NOT NULL DEFAULT 0,
                synced_hash TEXT,
                synced_at TEXT,
                updated_at TEXT NOT NULL,
                UNIQUE(game_id, local_path)
            );

            CREATE TABLE IF NOT EXISTS achievements (
                id TEXT PRIMARY KEY,
                game_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                icon TEXT NOT NULL DEFAULT '',
                points INTEGER NOT NULL DEFAULT 0,
                unlocked INTEGER NOT NULL DEFAULT 0,
                unlocked_at TEXT,
                recorded_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS cloud_sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                payload TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(kind, entity_id)
            );

            CREATE TABLE IF NOT EXISTS cloud_sync_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_cloud_saves_game ON cloud_saves(game_id);
            CREATE INDEX IF NOT EXISTS idx_achievements_game ON achievements(game_id);
            CREATE INDEX IF NOT EXISTS idx_queue_status ON cloud_sync_queue(status);
        ",
        )
        .map_err(|e| e.to_string())
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|_| "cloud database lock poisoned".to_string())
    }

    /// Borrow the connection for sibling modules in this crate (achievements).
    pub(super) fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.lock()
    }

    // -- saves ---------------------------------------------------------------

    /// Insert or update a save record, keeping any prior sync markers.
    ///
    /// `synced_hash`/`synced_at` are deliberately *not* overwritten: they are
    /// the common ancestor the conflict detector depends on. Only
    /// [`Self::mark_synced`] moves them.
    pub fn upsert_save(
        &self,
        game_id: &str,
        game_name: &str,
        local_path: &str,
        local_hash: &str,
        local_modified_ms: i64,
        local_size_bytes: i64,
    ) -> Result<CloudSaveRecord, String> {
        let conn = self.lock()?;
        let updated_at = now_iso();
        conn.execute(
            "INSERT INTO cloud_saves
                (game_id, game_name, local_path, local_hash, remote_hash,
                 local_modified_ms, local_size_bytes, synced_hash, synced_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, NULL, NULL, ?7)
             ON CONFLICT(game_id, local_path) DO UPDATE SET
                game_name = excluded.game_name,
                local_hash = excluded.local_hash,
                local_modified_ms = excluded.local_modified_ms,
                local_size_bytes = excluded.local_size_bytes,
                updated_at = excluded.updated_at,
                remote_hash = COALESCE(cloud_saves.remote_hash, excluded.remote_hash)",
            params![
                game_id,
                game_name,
                local_path,
                local_hash,
                local_modified_ms,
                local_size_bytes,
                updated_at
            ],
        )
        .map_err(|e| e.to_string())?;

        drop(conn);
        self.get_save(game_id, local_path)?
            .ok_or_else(|| "save record vanished after upsert".to_string())
    }

    pub fn get_save(&self, game_id: &str, local_path: &str) -> Result<Option<CloudSaveRecord>, String> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT id, game_id, game_name, local_path, local_hash, remote_hash,
                    local_modified_ms, local_size_bytes, synced_hash, synced_at, updated_at
             FROM cloud_saves WHERE game_id = ?1 AND local_path = ?2",
            params![game_id, local_path],
            map_save,
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    /// All tracked saves, newest activity first.
    pub fn list_saves(&self) -> Result<Vec<CloudSaveRecord>, String> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, game_id, game_name, local_path, local_hash, remote_hash,
                        local_modified_ms, local_size_bytes, synced_hash, synced_at, updated_at
                 FROM cloud_saves ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], map_save).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn saves_for_game(&self, game_id: &str) -> Result<Vec<CloudSaveRecord>, String> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, game_id, game_name, local_path, local_hash, remote_hash,
                        local_modified_ms, local_size_bytes, synced_hash, synced_at, updated_at
                 FROM cloud_saves WHERE game_id = ?1 ORDER BY local_path",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![game_id], map_save).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    /// Record a successful sync, advancing the common ancestor.
    pub fn mark_synced(
        &self,
        game_id: &str,
        local_path: &str,
        synced_hash: &str,
        remote_hash: &str,
    ) -> Result<(), String> {
        let conn = self.lock()?;
        let at = now_iso();
        conn.execute(
            "UPDATE cloud_saves
             SET synced_hash = ?1, remote_hash = ?2, synced_at = ?3, updated_at = ?3
             WHERE game_id = ?4 AND local_path = ?5",
            params![synced_hash, remote_hash, at, game_id, local_path],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Detect conflicts across every tracked save.
    pub fn detect_conflicts(&self) -> Result<Vec<SaveConflict>, String> {
        let saves = self.list_saves()?;
        let mut conflicts = Vec::new();
        for save in saves {
            let remote = save.remote_hash.clone();
            if save.state(remote.as_deref()) == SaveState::Conflict {
                let remote_hash = remote.unwrap_or_default();
                let local_modified_ms = save.local_modified_ms;
                conflicts.push(SaveConflict {
                    message: format!(
                        "{} was modified both locally and in the cloud since the last sync",
                        save.game_name
                    ),
                    save,
                    remote_hash,
                    local_modified_ms,
                });
            }
        }
        Ok(conflicts)
    }

    /// Resolve a conflict by adopting `resolution` and advancing the marker.
    pub fn resolve_conflict(
        &self,
        game_id: &str,
        local_path: &str,
        resolution: ConflictResolution,
    ) -> Result<(), String> {
        let save = self
            .get_save(game_id, local_path)?
            .ok_or_else(|| format!("No save tracked for {} at {}", game_id, local_path))?;
        let remote_hash = save
            .remote_hash
            .clone()
            .ok_or_else(|| "Save has no remote copy to resolve against".to_string())?;
        let resolved = resolution.resolved_hash(&save.local_hash, &remote_hash);
        let resolved = resolved.to_string();
        self.mark_synced(game_id, local_path, &resolved, &resolved)
    }

    // -- sync bookkeeping ----------------------------------------------------

    pub fn set_meta(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO cloud_sync_meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_meta(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.lock()?;
        conn.query_row("SELECT value FROM cloud_sync_meta WHERE key = ?1", params![key], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())
    }

    /// Queue an upload unless an identical pending item already exists.
    ///
    /// Idempotent by design: re-unlocking the same achievement or re-scanning
    /// the same save must not flood the queue.
    pub fn enqueue(&self, kind: &str, entity_id: &str, payload: &str) -> Result<i64, String> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO cloud_sync_queue (kind, entity_id, payload, status, created_at)
             VALUES (?1, ?2, ?3, 'pending', ?4)
             ON CONFLICT(kind, entity_id) DO UPDATE SET
                payload = excluded.payload,
                status = CASE WHEN cloud_sync_queue.status = 'done' THEN 'pending'
                              ELSE cloud_sync_queue.status END",
            params![kind, entity_id, payload, now_iso()],
        )
        .map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id FROM cloud_sync_queue WHERE kind = ?1 AND entity_id = ?2",
            params![kind, entity_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())
    }

    pub fn pending_count(&self) -> Result<i64, String> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT COUNT(*) FROM cloud_sync_queue WHERE status = 'pending'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())
    }

    /// Mark every pending item as uploaded and stamp the last-sync time.
    pub fn flush_queue(&self) -> Result<i64, String> {
        let conn = self.lock()?;
        let updated = conn
            .execute(
                "UPDATE cloud_sync_queue SET status = 'done' WHERE status = 'pending'",
                [],
            )
            .map_err(|e| e.to_string())?;
        drop(conn);
        self.set_meta("last_sync_at", &now_iso())?;
        Ok(updated as i64)
    }

    pub fn last_sync_at(&self) -> Result<Option<String>, String> {
        self.get_meta("last_sync_at")
    }
}

fn map_save(row: &rusqlite::Row<'_>) -> rusqlite::Result<CloudSaveRecord> {
    Ok(CloudSaveRecord {
        id: row.get(0)?,
        game_id: row.get(1)?,
        game_name: row.get(2)?,
        local_path: row.get(3)?,
        local_hash: row.get(4)?,
        remote_hash: row.get(5)?,
        local_modified_ms: row.get(6)?,
        local_size_bytes: row.get(7)?,
        synced_hash: row.get(8)?,
        synced_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(db: &CloudDb, hash: &str, remote: Option<&str>, synced: Option<&str>) -> CloudSaveRecord {
        let record = db
            .upsert_save("g1", "Test Game", "C:/saves/slot1.sav", hash, 1_000, 128)
            .expect("upsert should succeed");
        if let Some(remote) = remote {
            let conn = db.lock().unwrap();
            conn.execute(
                "UPDATE cloud_saves SET remote_hash = ?1, synced_hash = ?2, synced_at = '2026-01-01T00:00:00Z' WHERE id = ?3",
                params![remote, synced, record.id],
            )
            .unwrap();
        }
        db.get_save("g1", "C:/saves/slot1.sav").unwrap().unwrap()
    }

    #[test]
    fn upsert_creates_then_updates_in_place() {
        let db = CloudDb::in_memory().unwrap();
        let first = seed(&db, "aaa", None, None);
        assert_eq!(first.local_hash, "aaa");

        let second = db
            .upsert_save("g1", "Test Game", "C:/saves/slot1.sav", "bbb", 2_000, 256)
            .unwrap();
        assert_eq!(second.id, first.id, "same (game, path) should reuse the row");
        assert_eq!(second.local_hash, "bbb");
        assert_eq!(db.list_saves().unwrap().len(), 1);
    }

    #[test]
    fn upsert_preserves_the_sync_ancestor() {
        let db = CloudDb::in_memory().unwrap();
        seed(&db, "base", Some("base"), Some("base"));

        let updated = db
            .upsert_save("g1", "Test Game", "C:/saves/slot1.sav", "changed", 3_000, 256)
            .unwrap();
        assert_eq!(updated.synced_hash.as_deref(), Some("base"));
        assert_eq!(updated.remote_hash.as_deref(), Some("base"));
    }

    #[test]
    fn unsynced_save_is_never_state() {
        let db = CloudDb::in_memory().unwrap();
        let save = seed(&db, "aaa", None, None);
        assert_eq!(save.state(None), SaveState::Never);
    }

    #[test]
    fn identical_hashes_are_in_sync() {
        let db = CloudDb::in_memory().unwrap();
        let save = seed(&db, "same", Some("same"), Some("same"));
        assert_eq!(save.state(Some("same")), SaveState::InSync);
    }

    #[test]
    fn only_local_change_is_local_ahead() {
        let db = CloudDb::in_memory().unwrap();
        let save = seed(&db, "new-local", Some("base"), Some("base"));
        assert_eq!(save.state(Some("base")), SaveState::LocalAhead);
        assert!(!save.state(Some("base")).needs_resolution());
    }

    #[test]
    fn only_remote_change_is_remote_ahead() {
        let db = CloudDb::in_memory().unwrap();
        let save = seed(&db, "base", Some("new-remote"), Some("base"));
        assert_eq!(save.state(Some("new-remote")), SaveState::RemoteAhead);
    }

    #[test]
    fn both_sides_changed_is_a_conflict() {
        let db = CloudDb::in_memory().unwrap();
        let save = seed(&db, "new-local", Some("new-remote"), Some("base"));
        assert_eq!(save.state(Some("new-remote")), SaveState::Conflict);

        let conflicts = db.detect_conflicts().unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].remote_hash, "new-remote");
        assert!(conflicts[0].message.contains("Test Game"));
    }

    #[test]
    fn no_conflicts_when_nothing_diverged() {
        let db = CloudDb::in_memory().unwrap();
        seed(&db, "base", Some("base"), Some("base"));
        assert!(db.detect_conflicts().unwrap().is_empty());
    }

    #[test]
    fn mark_synced_clears_the_conflict() {
        let db = CloudDb::in_memory().unwrap();
        seed(&db, "new-local", Some("new-remote"), Some("base"));
        assert_eq!(db.detect_conflicts().unwrap().len(), 1);

        db.mark_synced("g1", "C:/saves/slot1.sav", "new-local", "new-local")
            .unwrap();
        assert!(db.detect_conflicts().unwrap().is_empty());
        let save = db.get_save("g1", "C:/saves/slot1.sav").unwrap().unwrap();
        assert!(save.synced_at.is_some());
    }

    #[test]
    fn resolving_by_keeping_remote_adopts_the_remote_hash() {
        let db = CloudDb::in_memory().unwrap();
        seed(&db, "new-local", Some("new-remote"), Some("base"));

        db.resolve_conflict("g1", "C:/saves/slot1.sav", ConflictResolution::KeepRemote)
            .unwrap();
        let save = db.get_save("g1", "C:/saves/slot1.sav").unwrap().unwrap();
        assert_eq!(save.synced_hash.as_deref(), Some("new-remote"));
        assert!(db.detect_conflicts().unwrap().is_empty());
    }

    #[test]
    fn resolving_by_keeping_local_adopts_the_local_hash() {
        let db = CloudDb::in_memory().unwrap();
        seed(&db, "new-local", Some("new-remote"), Some("base"));

        db.resolve_conflict("g1", "C:/saves/slot1.sav", ConflictResolution::KeepLocal)
            .unwrap();
        let save = db.get_save("g1", "C:/saves/slot1.sav").unwrap().unwrap();
        assert_eq!(save.synced_hash.as_deref(), Some("new-local"));
    }

    #[test]
    fn resolving_an_unknown_save_errors() {
        let db = CloudDb::in_memory().unwrap();
        let err = db
            .resolve_conflict("ghost", "C:/nope", ConflictResolution::KeepLocal)
            .unwrap_err();
        assert!(err.contains("No save tracked"));
    }

    #[test]
    fn queue_is_idempotent_and_flushes() {
        let db = CloudDb::in_memory().unwrap();
        assert_eq!(db.pending_count().unwrap(), 0);

        let a = db.enqueue("achievement", "ach-1", "{}").unwrap();
        let b = db.enqueue("achievement", "ach-1", "{}").unwrap();
        assert_eq!(a, b, "re-queueing the same entity must not duplicate");
        assert_eq!(db.pending_count().unwrap(), 1);

        db.enqueue("save", "g1/slot1", "{}").unwrap();
        assert_eq!(db.pending_count().unwrap(), 2);

        assert_eq!(db.flush_queue().unwrap(), 2);
        assert_eq!(db.pending_count().unwrap(), 0);
        assert!(db.last_sync_at().unwrap().is_some());
    }

    #[test]
    fn reopened_database_keeps_its_rows() {
        let dir = std::env::temp_dir().join(format!(
            "mvo_cloud_reopen_{}_{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);

        {
            let db = CloudDb::open(&dir).unwrap();
            db.upsert_save("g1", "Game", "C:/s/s.sav", "hash", 1, 1).unwrap();
            db.enqueue("achievement", "a1", "{}").unwrap();
        }
        {
            let db = CloudDb::open(&dir).unwrap();
            assert_eq!(db.list_saves().unwrap().len(), 1);
            assert_eq!(db.pending_count().unwrap(), 1);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn saves_can_be_filtered_by_game() {
        let db = CloudDb::in_memory().unwrap();
        db.upsert_save("g1", "One", "C:/a.sav", "h1", 1, 1).unwrap();
        db.upsert_save("g1", "One", "C:/b.sav", "h2", 2, 2).unwrap();
        db.upsert_save("g2", "Two", "C:/c.sav", "h3", 3, 3).unwrap();

        assert_eq!(db.saves_for_game("g1").unwrap().len(), 2);
        assert_eq!(db.saves_for_game("g2").unwrap().len(), 1);
        assert_eq!(db.list_saves().unwrap().len(), 3);
    }
}
