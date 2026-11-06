//! Orchestration for save scanning and sync-status reporting.
//!
//! Kept deliberately free of Tauri/AppHandle types so the whole flow is unit
//! testable; the IPC commands in `crate::cloud` are thin wrappers.

use serde::{Deserialize, Serialize};
use std::path::Path;

use super::db::{CloudDb, CloudSaveRecord};
use super::{sha256_file, now_iso, SaveState};

/// Snapshot shown in the "Cloud & Achievements" view.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub tracked_saves: usize,
    pub in_sync: usize,
    pub local_ahead: usize,
    pub remote_ahead: usize,
    pub conflicts: usize,
    pub never_synced: usize,
    pub pending_uploads: i64,
    pub last_sync_at: Option<String>,
    pub achievements_unlocked: usize,
    pub achievements_total: usize,
}

impl SyncStatus {
    /// Healthy when nothing is diverged and the upload queue is empty.
    pub fn is_healthy(&self) -> bool {
        self.conflicts == 0 && self.pending_uploads == 0
    }
}

/// Result of re-scanning a game's save files.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSummary {
    pub scanned: usize,
    pub changed: usize,
    pub queued: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
    pub conflicts: Vec<String>,
}

/// Hash and record one save file.
///
/// Returns `(record, changed)` where `changed` is true when the on-disk hash
/// differs from what we last recorded — only then is an upload queued.
pub fn track_save(
    db: &CloudDb,
    game_id: &str,
    game_name: &str,
    path: &Path,
) -> Result<(CloudSaveRecord, bool), String> {
    if !path.is_file() {
        return Err(format!("Save file not found: {}", path.display()));
    }

    let metadata = std::fs::metadata(path).map_err(|e| format!("Cannot stat save: {}", e))?;
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let hash = sha256_file(path)?;
    let size = metadata.len() as i64;
    let local_path = path.to_string_lossy().to_string();

    let previous = db.get_save(game_id, &local_path)?.map(|s| s.local_hash);
    let changed = previous.as_deref() != Some(hash.as_str());

    let record = db.upsert_save(game_id, game_name, &local_path, &hash, modified_ms, size)?;
    Ok((record, changed))
}

/// Scan a set of save files, queueing uploads for anything that changed.
pub fn scan_saves(
    db: &CloudDb,
    game_id: &str,
    game_name: &str,
    paths: &[String],
) -> Result<SyncSummary, String> {
    let mut summary = SyncSummary::default();

    for raw in paths {
        let path = Path::new(raw);
        match track_save(db, game_id, game_name, path) {
            Ok((record, changed)) => {
                summary.scanned += 1;
                if changed {
                    summary.changed += 1;
                    let payload = serde_json::json!({
                        "gameId": record.game_id,
                        "path": record.local_path,
                        "hash": record.local_hash,
                        "sizeBytes": record.local_size_bytes,
                    })
                    .to_string();
                    let entity = format!("{}|{}", record.game_id, record.local_path);
                    db.enqueue("save", &entity, &payload)?;
                    summary.queued += 1;
                } else {
                    summary.skipped += 1;
                }

                let remote = record.remote_hash.clone();
                if record.state(remote.as_deref()).needs_resolution() {
                    summary.conflicts.push(record.local_path.clone());
                }
            }
            Err(e) => summary.errors.push(e),
        }
    }

    Ok(summary)
}

/// Build the overview shown in the UI.
pub fn build_status(db: &CloudDb) -> Result<SyncStatus, String> {
    let saves = db.list_saves()?;
    let mut status = SyncStatus {
        tracked_saves: saves.len(),
        pending_uploads: db.pending_count()?,
        last_sync_at: db.last_sync_at()?,
        ..Default::default()
    };

    for save in saves {
        let remote = save.remote_hash.clone();
        match save.state(remote.as_deref()) {
            SaveState::InSync => status.in_sync += 1,
            SaveState::LocalAhead => status.local_ahead += 1,
            SaveState::RemoteAhead => status.remote_ahead += 1,
            SaveState::Conflict => status.conflicts += 1,
            SaveState::Never => status.never_synced += 1,
        }
    }

    let achievements = super::achievements::overall_state(db)?;
    status.achievements_total = achievements.total;
    status.achievements_unlocked = achievements.unlocked;

    Ok(status)
}

/// Flush pending uploads and stamp the sync time. Returns items uploaded.
pub fn flush(db: &CloudDb) -> Result<i64, String> {
    db.flush_queue()
}

/// Convenience wrapper used by the IPC layer for "sync now".
pub fn sync_now(db: &CloudDb) -> Result<(i64, String), String> {
    let uploaded = flush(db)?;
    let at = db.last_sync_at()?.unwrap_or_else(now_iso);
    Ok((uploaded, at))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mvo_cloud_sync_{}_{}_{:?}",
            tag,
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(dir: &Path, name: &str, content: &[u8]) -> String {
        let path = dir.join(name);
        std::fs::write(&path, content).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn tracking_a_new_save_reports_change() {
        let dir = temp_dir("new");
        let db = CloudDb::in_memory().unwrap();
        let path = write(&dir, "slot1.sav", b"hello");

        let (record, changed) = track_save(&db, "g1", "Game", Path::new(&path)).unwrap();
        assert!(changed);
        assert_eq!(record.local_size_bytes, 5);
        assert_eq!(record.local_hash, super::super::sha256_hex(b"hello"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn retracking_an_unchanged_save_reports_no_change() {
        let dir = temp_dir("same");
        let db = CloudDb::in_memory().unwrap();
        let path = write(&dir, "slot1.sav", b"hello");

        track_save(&db, "g1", "Game", Path::new(&path)).unwrap();
        let (_, changed) = track_save(&db, "g1", "Game", Path::new(&path)).unwrap();
        assert!(!changed);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn modifying_a_save_reports_change() {
        let dir = temp_dir("mod");
        let db = CloudDb::in_memory().unwrap();
        let path = write(&dir, "slot1.sav", b"version-1");

        track_save(&db, "g1", "Game", Path::new(&path)).unwrap();
        std::fs::write(&path, b"version-2-longer").unwrap();

        let (record, changed) = track_save(&db, "g1", "Game", Path::new(&path)).unwrap();
        assert!(changed);
        assert_eq!(record.local_hash, super::super::sha256_hex(b"version-2-longer"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tracking_a_missing_file_errors() {
        let db = CloudDb::in_memory().unwrap();
        let missing = std::env::temp_dir().join("mvo_cloud_no_such_save.sav");
        let _ = std::fs::remove_file(&missing);
        let err = track_save(&db, "g1", "Game", &missing).unwrap_err();
        assert!(err.contains("Save file not found"));
    }

    #[test]
    fn scan_queues_only_changed_files() {
        let dir = temp_dir("scan");
        let db = CloudDb::in_memory().unwrap();
        let a = write(&dir, "a.sav", b"aaa");
        let b = write(&dir, "b.sav", b"bbb");

        let first = scan_saves(&db, "g1", "Game", &[a.clone(), b.clone()]).unwrap();
        assert_eq!(first.scanned, 2);
        assert_eq!(first.changed, 2);
        assert_eq!(first.queued, 2);

        let second = scan_saves(&db, "g1", "Game", &[a, b]).unwrap();
        assert_eq!(second.scanned, 2);
        assert_eq!(second.changed, 0);
        assert_eq!(second.skipped, 2);
        assert_eq!(second.queued, 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn scan_collects_errors_without_aborting() {
        let dir = temp_dir("err");
        let db = CloudDb::in_memory().unwrap();
        let good = write(&dir, "good.sav", b"ok");
        let missing = dir.join("missing.sav").to_string_lossy().to_string();

        let summary = scan_saves(&db, "g1", "Game", &[good, missing]).unwrap();
        assert_eq!(summary.scanned, 1);
        assert_eq!(summary.errors.len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn flush_uploads_the_queue_and_stamps_time() {
        let db = CloudDb::in_memory().unwrap();
        db.enqueue("save", "g1|a", "{}").unwrap();
        db.enqueue("achievement", "ach", "{}").unwrap();

        let (uploaded, at) = sync_now(&db).unwrap();
        assert_eq!(uploaded, 2);
        assert!(at.ends_with('Z'));
        assert_eq!(db.pending_count().unwrap(), 0);
    }

    #[test]
    fn status_reflects_divergence_states() {
        let db = CloudDb::in_memory().unwrap();
        // In sync.
        db.upsert_save("g1", "Game", "C:/a.sav", "h", 1, 1).unwrap();
        db.mark_synced("g1", "C:/a.sav", "h", "h").unwrap();
        // Local ahead.
        db.upsert_save("g1", "Game", "C:/b.sav", "local", 1, 1).unwrap();
        db.mark_synced("g1", "C:/b.sav", "base", "base").unwrap();
        db.upsert_save("g1", "Game", "C:/b.sav", "local2", 2, 2).unwrap();

        let status = build_status(&db).unwrap();
        assert_eq!(status.tracked_saves, 2);
        assert_eq!(status.in_sync, 1);
        assert_eq!(status.local_ahead, 1);
        assert_eq!(status.conflicts, 0);
        assert_eq!(status.pending_uploads, 0);
        assert!(status.is_healthy());
    }

    #[test]
    fn status_is_unhealthy_with_a_conflict() {
        let db = CloudDb::in_memory().unwrap();
        db.upsert_save("g1", "Game", "C:/a.sav", "local", 1, 1).unwrap();
        // Establish an ancestor, then move the remote side out-of-band.
        db.mark_synced("g1", "C:/a.sav", "base", "base").unwrap();
        db.upsert_save("g1", "Game", "C:/a.sav", "local-new", 2, 2).unwrap();
        {
            let conn = db.connection().unwrap();
            conn.execute(
                "UPDATE cloud_saves SET remote_hash = 'remote-new' WHERE game_id = 'g1'",
                [],
            )
            .unwrap();
        }

        let status = build_status(&db).unwrap();
        assert_eq!(status.conflicts, 1);
        assert!(!status.is_healthy());
    }

    #[test]
    fn status_counts_achievements() {
        let db = CloudDb::in_memory().unwrap();
        let defs = vec![
            super::super::achievements::AchievementDefinition {
                id: "a1".into(),
                name: "First".into(),
                description: String::new(),
                icon: String::new(),
                points: 10,
            },
            super::super::achievements::AchievementDefinition {
                id: "a2".into(),
                name: "Second".into(),
                description: String::new(),
                icon: String::new(),
                points: 20,
            },
        ];
        super::super::achievements::register_definitions(&db, "g1", &defs).unwrap();
        super::super::achievements::unlock(&db, "a1").unwrap();

        let status = build_status(&db).unwrap();
        assert_eq!(status.achievements_total, 2);
        assert_eq!(status.achievements_unlocked, 1);
    }
}
