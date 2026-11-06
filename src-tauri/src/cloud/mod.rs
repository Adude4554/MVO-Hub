//! Cloud Saves & Achievement Sync — v0.3.0 Step 2.
//!
//! Two tightly-coupled concerns live here:
//!
//! * **Save sync** — track the timestamp, size and SHA-256 of each game's save
//!   files, and resolve conflicts when a local and a remote copy have diverged.
//! * **Achievements** — record unlocks locally, then queue them for upload.
//!
//! Everything is persisted next to the rest of the app state, in the same
//! SQLite database as GameVault (`gamevault.db`), so a single file remains the
//! source of truth for a user's local state.
//!
//! No network calls happen in this module. "Cloud" uploads are queued rows in
//! `cloud_sync_queue`; a future transport drains that queue. That keeps the
//! sync semantics testable and the app functional offline.

pub mod achievements;
pub mod commands;
pub mod db;
pub mod sync;

pub use achievements::{Achievement, AchievementDefinition, AchievementRecord, AchievementState};
pub use db::{CloudDb, CloudSaveRecord, ConflictResolution, SaveConflict};
pub use sync::{SyncSummary, SyncStatus};

use serde::{Deserialize, Serialize};

/// Files are hashed in chunks so large saves don't spike memory.
const HASH_CHUNK_BYTES: usize = 64 * 1024;

/// Compute the SHA-256 of a file, or of an in-memory slice.
pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

/// Compute the SHA-256 of a file on disk by streaming it in chunks.
pub fn sha256_file(path: &std::path::Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let mut file =
        std::fs::File::open(path).map_err(|e| format!("Cannot open {}: {}", path.display(), e))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; HASH_CHUNK_BYTES];
    loop {
        let read = file
            .read(&mut buf)
            .map_err(|e| format!("Cannot read {}: {}", path.display(), e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// ISO-8601 UTC timestamp used for every cloud/achievement record.
pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// How the local copy relates to the last known cloud copy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SaveState {
    /// Identical hash to the cloud copy; nothing to do.
    InSync,
    /// Local hash changed since the last sync; safe to upload.
    LocalAhead,
    /// Only the cloud copy changed; safe to download.
    RemoteAhead,
    /// Both sides changed independently; a human must choose.
    Conflict,
    /// Never synced.
    Never,
}

impl SaveState {
    /// True when the two sides diverged in a way that silently overwriting
    /// either one would lose work. This is the guard that prevents the classic
    /// "last writer wins" silent data loss.
    pub fn needs_resolution(self) -> bool {
        matches!(self, SaveState::Conflict)
    }
}

/// What the caller decides to do about a detected conflict.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictChoice {
    /// Keep the local file and overwrite the cloud copy.
    KeepLocal,
    /// Keep the cloud file and overwrite the local copy.
    KeepRemote,
    /// Keep both: the local file is renamed with a timestamp suffix.
    KeepBoth,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_hex_matches_known_vectors() {
        // Canonical SHA-256 test vectors.
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn sha256_hex_is_stable_across_calls() {
        let data = vec![7u8; 100_000];
        assert_eq!(sha256_hex(&data), sha256_hex(&data));
    }

    #[test]
    fn sha256_hex_detects_single_byte_change() {
        let mut data = b"save-state-payload".to_vec();
        let before = sha256_hex(&data);
        data[3] ^= 0xFF;
        assert_ne!(before, sha256_hex(&data));
    }

    #[test]
    fn sha256_file_matches_in_memory_hash() {
        let dir = std::env::temp_dir().join(format!("mvo_cloud_hash_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("save.dat");

        // Larger than one chunk so the streaming path is exercised.
        let payload: Vec<u8> = (0..(HASH_CHUNK_BYTES * 2 + 17)).map(|i| (i % 251) as u8).collect();
        std::fs::write(&path, &payload).unwrap();

        assert_eq!(sha256_file(&path).unwrap(), sha256_hex(&payload));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sha256_file_reports_missing_files() {
        let missing = std::env::temp_dir().join("mvo_cloud_definitely_missing_save.dat");
        let _ = std::fs::remove_file(&missing);
        let err = sha256_file(&missing).unwrap_err();
        assert!(err.contains("Cannot open"), "unexpected error: {}", err);
    }

    #[test]
    fn only_conflict_needs_resolution() {
        assert!(SaveState::Conflict.needs_resolution());
        for state in [
            SaveState::InSync,
            SaveState::LocalAhead,
            SaveState::RemoteAhead,
            SaveState::Never,
        ] {
            assert!(!state.needs_resolution(), "{:?} should not need resolution", state);
        }
    }

    #[test]
    fn now_iso_is_utc_and_parseable() {
        let stamp = now_iso();
        assert!(stamp.ends_with('Z'), "timestamps should be UTC: {}", stamp);
        assert!(chrono::DateTime::parse_from_rfc3339(&stamp).is_ok());
    }
}
