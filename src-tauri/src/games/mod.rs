//! Advanced game management: overrides, launch spec building, playtime.
//!
//! All persistent state for this feature lives in `game_management.db`, kept
//! deliberately separate from `gamevault.db` so a scanner database rebuild can
//! never wipe a user's custom arguments, executable overrides or cover art.
//!
//! Playtime is *accumulated* here rather than in `scanned_games`: a rescan
//! replaces scan rows, and losing hours of playtime to a rescan would be a
//! silent data-loss bug. `playtime_seconds` in this table is authoritative.

pub mod commands;
pub mod launch_args;
pub mod process;
pub mod sessions;

pub use launch_args::{format_launch_args, parse_launch_args, sanitize_launch_args, ParsedArgs};
pub use process::{ProcessMonitor, ProcessState};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// How long a game must stay hidden from the process list before we call it
/// closed. Engines often re-exec or briefly drop out; a naive check would end
/// and restart sessions constantly and fragment playtime.
pub const EXIT_GRACE_SECS: u64 = 5;

/// User-editable per-game configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfig {
    pub game_id: String,
    /// Raw, user-authored launch arguments (validated before a launch).
    pub launch_args: String,
    /// Overrides the scanner-detected executable.
    pub exe_override: Option<String>,
    /// Overrides the scanner-detected working directory.
    pub working_dir: Option<String>,
    /// Path to an uploaded custom cover image.
    pub custom_cover: Option<String>,
    /// Path to an uploaded custom banner image.
    pub custom_banner: Option<String>,
    /// Accumulated playtime, authoritative for this game.
    pub playtime_seconds: i64,
    pub last_played: Option<String>,
    pub updated_at: String,
}

impl GameConfig {
    pub fn empty(game_id: &str) -> Self {
        Self {
            game_id: game_id.to_string(),
            launch_args: String::new(),
            exe_override: None,
            working_dir: None,
            custom_cover: None,
            custom_banner: None,
            playtime_seconds: 0,
            last_played: None,
            updated_at: now_iso(),
        }
    }

    /// Playtime split into hours/minutes for display.
    pub fn playtime_parts(&self) -> (i64, i64) {
        (self.playtime_seconds / 3600, (self.playtime_seconds % 3600) / 60)
    }
}

/// Patch applied by [`GameStore::update_config`]. `None` means "leave alone",
/// which is what lets the UI save one field without clobbering the others.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfigPatch {
    #[serde(default)]
    pub launch_args: Option<String>,
    #[serde(default)]
    pub exe_override: Option<String>,
    #[serde(default)]
    pub working_dir: Option<String>,
    #[serde(default)]
    pub custom_cover: Option<String>,
    #[serde(default)]
    pub custom_banner: Option<String>,
}

/// What the scanner knows; supplied by the caller so this module stays
/// decoupled from `gamevault::db`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedGame {
    pub game_id: String,
    pub name: String,
    pub exe_path: Option<String>,
    pub install_path: String,
    pub working_dir: Option<String>,
    pub banner_path: Option<String>,
    pub cover_path: Option<String>,
}

/// A fully-resolved instruction for launching one game.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchSpec {
    pub game_id: String,
    pub game_name: String,
    pub exe_path: String,
    pub working_dir: Option<String>,
    pub args: Vec<String>,
}

/// Errors that block a launch, deliberately distinct from I/O failures so the
/// UI can point at the exact field to fix.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchError {
    MissingExecutable,
    ExecutableNotFound(String),
    InvalidArgs(String),
}

impl std::fmt::Display for LaunchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LaunchError::MissingExecutable => write!(
                f,
                "No executable set for this game. Set an executable override in the game's settings."
            ),
            LaunchError::ExecutableNotFound(p) => write!(f, "Executable not found: {}", p),
            LaunchError::InvalidArgs(e) => write!(f, "{}", e),
        }
    }
}

impl std::error::Error for LaunchError {}

/// Build the command line for a game, applying overrides in priority order.
///
/// `validate_path` lets tests run without touching the filesystem; production
/// callers pass `Path::exists`.
pub fn build_launch_spec(
    detected: &DetectedGame,
    config: &GameConfig,
    validate_path: impl Fn(&Path) -> bool,
) -> Result<LaunchSpec, LaunchError> {
    let args = sanitize_launch_args(&config.launch_args).map_err(LaunchError::InvalidArgs)?;

    let exe = config
        .exe_override
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .or_else(|| detected.exe_path.as_deref().map(PathBuf::from))
        .ok_or(LaunchError::MissingExecutable)?;

    if !validate_path(&exe) {
        return Err(LaunchError::ExecutableNotFound(exe.to_string_lossy().to_string()));
    }

    let working_dir = config
        .working_dir
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| {
            // Fall back to the executable's own folder, which is the most
            // reliable guess for games whose launcher expects to be CWD-resident.
            exe.parent().map(|p| p.to_string_lossy().to_string())
        })
        .or_else(|| {
            let install = detected.install_path.trim();
            (!install.is_empty()).then(|| install.to_string())
        });

    Ok(LaunchSpec {
        game_id: detected.game_id.clone(),
        game_name: detected.name.clone(),
        exe_path: exe.to_string_lossy().to_string(),
        working_dir,
        args,
    })
}

/// Cheap to clone: the connection is shared behind an `Arc<Mutex<_>>`, so clones
/// address the same database (used by the enterprise layer and by tests that
/// simulate a restart against one store).
#[derive(Clone)]
pub struct GameStore {
    conn: Arc<Mutex<Connection>>,
}

impl std::fmt::Debug for GameStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GameStore").finish_non_exhaustive()
    }
}

impl GameStore {
    /// Open the store inside `<app_data_dir>/game_management.db`.
    pub fn open(app_data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
        let conn =
            Connection::open(app_data_dir.join("game_management.db")).map_err(|e| e.to_string())?;
        Self::from_connection(conn)
    }

    pub fn in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        Self::from_connection(conn)
    }

    fn from_connection(conn: Connection) -> Result<Self, String> {
        conn.pragma_update(None, "journal_mode", "WAL").map_err(|e| e.to_string())?;
        conn.busy_timeout(std::time::Duration::from_millis(5000))
            .map_err(|e| e.to_string())?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS game_config (
                game_id TEXT PRIMARY KEY,
                launch_args TEXT NOT NULL DEFAULT '',
                exe_override TEXT,
                working_dir TEXT,
                custom_cover TEXT,
                custom_banner TEXT,
                playtime_seconds INTEGER NOT NULL DEFAULT 0,
                last_played TEXT,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playtime_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id TEXT NOT NULL,
                game_name TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_game
                ON playtime_sessions(game_id, started_at DESC);

            -- White-label tenant profiles. One row per tenant id; the active
            -- profile is the one flagged `is_active`. Storing the profile as
            -- JSON keeps the enterprise schema decoupled from this module's
            -- types while still giving us a real, queryable record.
            CREATE TABLE IF NOT EXISTS tenant_profiles (
                tenant_id TEXT PRIMARY KEY,
                profile_json TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tenant_active
                ON tenant_profiles(is_active);
        ",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|_| "game management lock poisoned".to_string())
    }

    /// Read a game's config, synthesising an empty one when absent so callers
    /// never have to special-case "first launch".
    pub fn get_config(&self, game_id: &str) -> Result<GameConfig, String> {
        let conn = self.lock()?;
        let existing = conn
            .query_row(
                "SELECT game_id, launch_args, exe_override, working_dir, custom_cover,
                        custom_banner, playtime_seconds, last_played, updated_at
                 FROM game_config WHERE game_id = ?1",
                params![game_id],
                |row| {
                    Ok(GameConfig {
                        game_id: row.get(0)?,
                        launch_args: row.get(1)?,
                        exe_override: row.get(2)?,
                        working_dir: row.get(3)?,
                        custom_cover: row.get(4)?,
                        custom_banner: row.get(5)?,
                        playtime_seconds: row.get(6)?,
                        last_played: row.get(7)?,
                        updated_at: row.get(8)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        Ok(existing.unwrap_or_else(|| GameConfig::empty(game_id)))
    }

    /// Apply a partial update. Invalid launch arguments are rejected *before*
    /// anything is written, so the store never holds a spec that cannot launch.
    pub fn update_config(&self, game_id: &str, patch: GameConfigPatch) -> Result<GameConfig, String> {
        if let Some(raw) = &patch.launch_args {
            sanitize_launch_args(raw)?;
        }

        let current = self.get_config(game_id)?;
        let next = GameConfig {
            game_id: current.game_id,
            launch_args: patch.launch_args.unwrap_or(current.launch_args),
            exe_override: patch.exe_override.or(current.exe_override),
            working_dir: patch.working_dir.or(current.working_dir),
            custom_cover: patch.custom_cover.or(current.custom_cover),
            custom_banner: patch.custom_banner.or(current.custom_banner),
            playtime_seconds: current.playtime_seconds,
            last_played: current.last_played,
            updated_at: now_iso(),
        };

        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO game_config
                (game_id, launch_args, exe_override, working_dir, custom_cover,
                 custom_banner, playtime_seconds, last_played, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(game_id) DO UPDATE SET
                launch_args = excluded.launch_args,
                exe_override = excluded.exe_override,
                working_dir = excluded.working_dir,
                custom_cover = excluded.custom_cover,
                custom_banner = excluded.custom_banner,
                updated_at = excluded.updated_at",
            params![
                next.game_id,
                next.launch_args,
                next.exe_override,
                next.working_dir,
                next.custom_cover,
                next.custom_banner,
                next.playtime_seconds,
                next.last_played,
                next.updated_at,
            ],
        )
        .map_err(|e| e.to_string())?;

        drop(conn);
        self.get_config(game_id)
    }

    /// All games that have any custom configuration.
    pub fn list_configured(&self) -> Result<Vec<GameConfig>, String> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT game_id, launch_args, exe_override, working_dir, custom_cover,
                        custom_banner, playtime_seconds, last_played, updated_at
                 FROM game_config ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(GameConfig {
                    game_id: row.get(0)?,
                    launch_args: row.get(1)?,
                    exe_override: row.get(2)?,
                    working_dir: row.get(3)?,
                    custom_cover: row.get(4)?,
                    custom_banner: row.get(5)?,
                    playtime_seconds: row.get(6)?,
                    last_played: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    // -- tenant profiles -----------------------------------------------------

    /// Persist a tenant profile and mark it active, deactivating any other.
    ///
    /// Done in one transaction so a crash cannot leave two profiles flagged
    /// active (or none), which would make the startup read ambiguous.
    pub fn save_tenant_profile(&self, tenant_id: &str, profile_json: &str) -> Result<(), String> {
        let at = now_iso();
        let mut conn = self.lock()?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("UPDATE tenant_profiles SET is_active = 0", [])
            .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO tenant_profiles (tenant_id, profile_json, is_active, updated_at)
             VALUES (?1, ?2, 1, ?3)
             ON CONFLICT(tenant_id) DO UPDATE SET
                profile_json = excluded.profile_json,
                is_active = 1,
                updated_at = excluded.updated_at",
            params![tenant_id, profile_json, at],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }

    /// The active tenant profile's JSON, if one has ever been saved.
    pub fn load_active_tenant_profile(&self) -> Result<Option<String>, String> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT profile_json FROM tenant_profiles WHERE is_active = 1 LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    /// How many tenant profiles are stored (active or not).
    pub fn tenant_profile_count(&self) -> Result<i64, String> {
        let conn = self.lock()?;
        conn.query_row("SELECT COUNT(*) FROM tenant_profiles", [], |r| r.get(0))
            .map_err(|e| e.to_string())
    }

    /// Add `seconds` to a game's total and stamp `last_played`.
    ///
    /// Uses SQL `playtime_seconds + ?` so concurrent session ends cannot
    /// overwrite each other with a stale read-modify-write.
    pub fn add_playtime(&self, game_id: &str, seconds: i64) -> Result<i64, String> {
        let seconds = seconds.max(0);
        let at = now_iso();
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO game_config (game_id, playtime_seconds, last_played, updated_at)
             VALUES (?1, ?2, ?3, ?3)
             ON CONFLICT(game_id) DO UPDATE SET
                playtime_seconds = game_config.playtime_seconds + excluded.playtime_seconds,
                last_played = excluded.last_played,
                updated_at = excluded.updated_at",
            params![game_id, seconds, at],
        )
        .map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT playtime_seconds FROM game_config WHERE game_id = ?1",
            params![game_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())
    }

    /// Persist a finished session and roll it into the total.
    pub fn record_session(
        &self,
        game_id: &str,
        game_name: &str,
        started_at: &str,
        ended_at: &str,
        duration_seconds: i64,
    ) -> Result<i64, String> {
        if duration_seconds < 0 {
            return Err("Session duration cannot be negative".into());
        }
        {
            let conn = self.lock()?;
            conn.execute(
                "INSERT INTO playtime_sessions
                    (game_id, game_name, started_at, ended_at, duration_seconds)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![game_id, game_name, started_at, ended_at, duration_seconds],
            )
            .map_err(|e| e.to_string())?;
        }
        self.add_playtime(game_id, duration_seconds)
    }

    /// Recent sessions for one game, newest first.
    pub fn recent_sessions(
        &self,
        game_id: &str,
        limit: usize,
    ) -> Result<Vec<SessionRow>, String> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, game_id, game_name, started_at, ended_at, duration_seconds
                 FROM playtime_sessions WHERE game_id = ?1
                 ORDER BY started_at DESC LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![game_id, limit as i64], |row| {
                Ok(SessionRow {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    game_name: row.get(2)?,
                    started_at: row.get(3)?,
                    ended_at: row.get(4)?,
                    duration_seconds: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn total_session_count(&self, game_id: &str) -> Result<i64, String> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT COUNT(*) FROM playtime_sessions WHERE game_id = ?1",
            params![game_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())
    }

    /// Copy user-supplied image bytes into the app's covers directory.
    ///
    /// The image is *validated by magic number* rather than by extension, since
    /// the extension is attacker-controlled. Returns the stored path.
    pub fn save_custom_image(
        &self,
        app_data_dir: &Path,
        game_id: &str,
        kind: ImageKind,
        data: &[u8],
    ) -> Result<String, String> {
        let format = sniff_image_format(data)
            .ok_or_else(|| "Unsupported image format (expected PNG, JPEG, WebP or GIF)".to_string())?;

        if data.len() > MAX_IMAGE_BYTES {
            return Err(format!(
                "Image is too large ({} KB, max {} KB)",
                data.len() / 1024,
                MAX_IMAGE_BYTES / 1024
            ));
        }

        let dir = app_data_dir.join("covers");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let safe_id = sanitize_file_stem(game_id);
        let path = dir.join(format!("{}-{}.{}", safe_id, kind.slug(), format.extension()));
        std::fs::write(&path, data).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().to_string())
    }
}

/// Maximum accepted cover/banner size.
pub const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImageKind {
    Cover,
    Banner,
}

impl ImageKind {
    fn slug(self) -> &'static str {
        match self {
            ImageKind::Cover => "cover",
            ImageKind::Banner => "banner",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Png,
    Jpeg,
    Webp,
    Gif,
}

impl ImageFormat {
    pub fn extension(self) -> &'static str {
        match self {
            ImageFormat::Png => "png",
            ImageFormat::Jpeg => "jpg",
            ImageFormat::Webp => "webp",
            ImageFormat::Gif => "gif",
        }
    }
}

/// Detect an image format from its magic bytes.
pub fn sniff_image_format(data: &[u8]) -> Option<ImageFormat> {
    if data.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some(ImageFormat::Png);
    }
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some(ImageFormat::Jpeg);
    }
    if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        return Some(ImageFormat::Webp);
    }
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        return Some(ImageFormat::Gif);
    }
    None
}

/// Reduce a game id to a filesystem-safe stem.
fn sanitize_file_stem(id: &str) -> String {
    let cleaned: String = id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if cleaned.is_empty() {
        "game".to_string()
    } else {
        cleaned
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRow {
    pub id: i64,
    pub game_id: String,
    pub game_name: String,
    pub started_at: String,
    pub ended_at: String,
    pub duration_seconds: i64,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn detected(id: &str, exe: Option<&str>) -> DetectedGame {
        DetectedGame {
            game_id: id.to_string(),
            name: format!("Game {}", id),
            exe_path: exe.map(str::to_string),
            install_path: "C:/Games/X".into(),
            working_dir: None,
            banner_path: None,
            cover_path: None,
        }
    }

    fn always_exists(_: &Path) -> bool {
        true
    }

    // -- launch spec ---------------------------------------------------------

    #[test]
    fn spec_uses_detected_executable_by_default() {
        let spec = build_launch_spec(
            &detected("g1", Some("C:/Games/X/game.exe")),
            &GameConfig::empty("g1"),
            always_exists,
        )
        .unwrap();
        assert_eq!(spec.exe_path, "C:/Games/X/game.exe");
        assert_eq!(spec.working_dir.as_deref(), Some("C:/Games/X"));
        assert!(spec.args.is_empty());
    }

    #[test]
    fn exe_override_wins_over_detected() {
        let config = GameConfig {
            exe_override: Some("D:/Other/launcher.exe".into()),
            ..GameConfig::empty("g1")
        };
        let spec =
            build_launch_spec(&detected("g1", Some("C:/Games/X/game.exe")), &config, always_exists)
                .unwrap();
        assert_eq!(spec.exe_path, "D:/Other/launcher.exe");
    }

    #[test]
    fn blank_override_is_ignored() {
        let config = GameConfig {
            exe_override: Some("   ".into()),
            ..GameConfig::empty("g1")
        };
        let spec =
            build_launch_spec(&detected("g1", Some("C:/Games/X/game.exe")), &config, always_exists)
                .unwrap();
        assert_eq!(spec.exe_path, "C:/Games/X/game.exe");
    }

    #[test]
    fn missing_executable_is_reported() {
        let err =
            build_launch_spec(&detected("g1", None), &GameConfig::empty("g1"), always_exists)
                .unwrap_err();
        assert_eq!(err, LaunchError::MissingExecutable);
    }

    #[test]
    fn non_existent_executable_is_reported() {
        let err = build_launch_spec(
            &detected("g1", Some("C:/nope.exe")),
            &GameConfig::empty("g1"),
            |_| false,
        )
        .unwrap_err();
        assert!(matches!(err, LaunchError::ExecutableNotFound(_)));
    }

    #[test]
    fn invalid_args_block_the_launch() {
        let config = GameConfig {
            launch_args: "-a & calc".into(),
            ..GameConfig::empty("g1")
        };
        let err = build_launch_spec(
            &detected("g1", Some("C:/Games/X/game.exe")),
            &config,
            always_exists,
        )
        .unwrap_err();
        assert!(matches!(err, LaunchError::InvalidArgs(_)));
    }

    #[test]
    fn valid_args_reach_the_spec() {
        let config = GameConfig {
            launch_args: "-windowed -name \"My Player\"".into(),
            ..GameConfig::empty("g1")
        };
        let spec = build_launch_spec(
            &detected("g1", Some("C:/Games/X/game.exe")),
            &config,
            always_exists,
        )
        .unwrap();
        assert_eq!(spec.args, vec!["-windowed", "-name", "My Player"]);
    }

    #[test]
    fn working_dir_override_beats_derived() {
        let config = GameConfig {
            working_dir: Some("D:/Saves".into()),
            ..GameConfig::empty("g1")
        };
        let spec = build_launch_spec(
            &detected("g1", Some("C:/Games/X/game.exe")),
            &config,
            always_exists,
        )
        .unwrap();
        assert_eq!(spec.working_dir.as_deref(), Some("D:/Saves"));
    }

    // -- config persistence --------------------------------------------------

    #[test]
    fn missing_config_returns_empty_not_error() {
        let store = GameStore::in_memory().unwrap();
        let config = store.get_config("never-seen").unwrap();
        assert_eq!(config.game_id, "never-seen");
        assert_eq!(config.playtime_seconds, 0);
        assert!(config.launch_args.is_empty());
    }

    #[test]
    fn patch_updates_only_the_named_fields() {
        let store = GameStore::in_memory().unwrap();
        store
            .update_config(
                "g1",
                GameConfigPatch {
                    launch_args: Some("-windowed".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        store
            .update_config(
                "g1",
                GameConfigPatch {
                    exe_override: Some("D:/x.exe".into()),
                    ..Default::default()
                },
            )
            .unwrap();

        let config = store.get_config("g1").unwrap();
        assert_eq!(config.launch_args, "-windowed", "args must survive the second patch");
        assert_eq!(config.exe_override.as_deref(), Some("D:/x.exe"));
    }

    #[test]
    fn invalid_launch_args_are_rejected_before_writing() {
        let store = GameStore::in_memory().unwrap();
        store
            .update_config(
                "g1",
                GameConfigPatch {
                    launch_args: Some("-windowed".into()),
                    ..Default::default()
                },
            )
            .unwrap();

        let err = store
            .update_config(
                "g1",
                GameConfigPatch {
                    launch_args: Some("-a | calc".into()),
                    ..Default::default()
                },
            )
            .unwrap_err();
        assert!(err.contains("not allowed"));
        assert_eq!(
            store.get_config("g1").unwrap().launch_args,
            "-windowed",
            "a rejected patch must not corrupt the stored value"
        );
    }

    #[test]
    fn config_survives_reopening() {
        let dir = std::env::temp_dir().join(format!(
            "mvo_games_reopen_{}_{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        {
            let store = GameStore::open(&dir).unwrap();
            store
                .update_config(
                    "g1",
                    GameConfigPatch {
                        launch_args: Some("-high".into()),
                        ..Default::default()
                    },
                )
                .unwrap();
            store.add_playtime("g1", 120).unwrap();
        }
        {
            let store = GameStore::open(&dir).unwrap();
            let config = store.get_config("g1").unwrap();
            assert_eq!(config.launch_args, "-high");
            assert_eq!(config.playtime_seconds, 120);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    // -- playtime ------------------------------------------------------------

    #[test]
    fn playtime_accumulates_across_sessions() {
        let store = GameStore::in_memory().unwrap();
        assert_eq!(store.add_playtime("g1", 60).unwrap(), 60);
        assert_eq!(store.add_playtime("g1", 90).unwrap(), 150);
        assert_eq!(store.get_config("g1").unwrap().playtime_seconds, 150);
    }

    #[test]
    fn negative_playtime_is_clamped_to_zero() {
        let store = GameStore::in_memory().unwrap();
        assert_eq!(store.add_playtime("g1", -500).unwrap(), 0);
    }

    #[test]
    fn add_playtime_stamps_last_played() {
        let store = GameStore::in_memory().unwrap();
        store.add_playtime("g1", 10).unwrap();
        assert!(store.get_config("g1").unwrap().last_played.is_some());
    }

    #[test]
    fn recording_a_session_rolls_into_total() {
        let store = GameStore::in_memory().unwrap();
        let total = store
            .record_session(
                "g1",
                "Game One",
                "2026-11-06T10:00:00Z",
                "2026-11-06T10:30:00Z",
                1800,
            )
            .unwrap();
        assert_eq!(total, 1800);
        assert_eq!(store.total_session_count("g1").unwrap(), 1);

        let sessions = store.recent_sessions("g1", 10).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].duration_seconds, 1800);
        assert_eq!(sessions[0].game_name, "Game One");
    }

    #[test]
    fn negative_session_duration_is_rejected() {
        let store = GameStore::in_memory().unwrap();
        assert!(store
            .record_session("g1", "Game", "a", "b", -1)
            .is_err());
        assert_eq!(store.total_session_count("g1").unwrap(), 0);
    }

    #[test]
    fn sessions_are_scoped_per_game() {
        let store = GameStore::in_memory().unwrap();
        store.record_session("g1", "One", "a", "b", 10).unwrap();
        store.record_session("g2", "Two", "a", "b", 20).unwrap();
        assert_eq!(store.total_session_count("g1").unwrap(), 1);
        assert_eq!(store.recent_sessions("g2", 10).unwrap().len(), 1);
    }

    #[test]
    fn playtime_parts_split_hours_and_minutes() {
        let config = GameConfig {
            playtime_seconds: 3661,
            ..GameConfig::empty("g1")
        };
        assert_eq!(config.playtime_parts(), (1, 1));
    }

    // -- images --------------------------------------------------------------

    #[test]
    fn image_formats_are_sniffed_by_magic_bytes() {
        assert_eq!(
            sniff_image_format(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0]),
            Some(ImageFormat::Png)
        );
        assert_eq!(
            sniff_image_format(&[0xFF, 0xD8, 0xFF, 0xE0]),
            Some(ImageFormat::Jpeg)
        );
        assert_eq!(
            sniff_image_format(b"RIFF____WEBPVP8 "),
            Some(ImageFormat::Webp)
        );
        assert_eq!(sniff_image_format(b"GIF89a...."), Some(ImageFormat::Gif));
        assert_eq!(sniff_image_format(b"not an image"), None);
        assert_eq!(sniff_image_format(b"<html>"), None);
    }

    #[test]
    fn rejecting_a_non_image_keeps_the_disk_clean() {
        let dir = std::env::temp_dir().join(format!(
            "mvo_games_img_{}_{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let store = GameStore::in_memory().unwrap();

        let err = store
            .save_custom_image(&dir, "g1", ImageKind::Cover, b"<script>alert(1)</script>")
            .unwrap_err();
        assert!(err.contains("Unsupported image format"));
        assert!(!dir.join("covers").exists(), "nothing should be written on rejection");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn saving_a_png_writes_a_predictable_path() {
        let dir = std::env::temp_dir().join(format!(
            "mvo_games_img_ok_{}_{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let store = GameStore::in_memory().unwrap();

        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0];
        let path = store
            .save_custom_image(&dir, "g1", ImageKind::Cover, &png)
            .unwrap();
        assert!(path.ends_with("g1-cover.png"));
        assert!(std::path::Path::new(&path).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn game_ids_cannot_escape_the_covers_directory() {
        assert_eq!(sanitize_file_stem("../../evil"), "______evil");
        assert_eq!(sanitize_file_stem("a/b\\c"), "a_b_c");
        assert_eq!(sanitize_file_stem(""), "game");
    }

    #[test]
    fn oversized_images_are_rejected() {
        let dir = std::env::temp_dir().join(format!(
            "mvo_games_big_{}_{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let store = GameStore::in_memory().unwrap();

        let mut png = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        png.resize(MAX_IMAGE_BYTES + 1, 0);
        let err = store
            .save_custom_image(&dir, "g1", ImageKind::Banner, &png)
            .unwrap_err();
        assert!(err.contains("too large"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
