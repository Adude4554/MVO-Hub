use rusqlite::{Connection, params};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;

use super::{InstalledGame, DownloadItem};

pub struct GameVaultDb {
    conn: Arc<Mutex<Connection>>,
}

impl std::fmt::Debug for GameVaultDb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GameVaultDb").finish_non_exhaustive()
    }
}

impl GameVaultDb {
    pub fn new(app_data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
        let db_path = app_data_dir.join("gamevault.db");
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS installed_games (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                version TEXT NOT NULL,
                developer TEXT NOT NULL,
                category TEXT NOT NULL,
                install_path TEXT NOT NULL,
                exe_path TEXT,
                cover TEXT,
                banner TEXT,
                icon TEXT,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                installed_at TEXT NOT NULL,
                last_played TEXT,
                play_time_seconds INTEGER NOT NULL DEFAULT 0,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                tags TEXT NOT NULL DEFAULT '[]',
                checksum TEXT
            );

            CREATE TABLE IF NOT EXISTS downloads (
                id TEXT PRIMARY KEY,
                store_item_id TEXT NOT NULL,
                name TEXT NOT NULL,
                download_url TEXT NOT NULL,
                dest_path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                progress REAL NOT NULL DEFAULT 0.0,
                speed_bytes INTEGER NOT NULL DEFAULT 0,
                downloaded_bytes INTEGER NOT NULL DEFAULT 0,
                total_bytes INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS recently_launched (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_name TEXT NOT NULL,
                exe_path TEXT NOT NULL,
                install_path TEXT,
                game_id TEXT,
                launched_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS download_history (
                id TEXT PRIMARY KEY,
                store_item_id TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                file_path TEXT,
                completed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS scanned_games (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                platform TEXT NOT NULL,
                launcher TEXT NOT NULL,
                install_path TEXT NOT NULL,
                exe_path TEXT,
                app_id TEXT,
                version TEXT,
                cover_path TEXT,
                cover_local TEXT,
                icon_local TEXT,
                install_size INTEGER DEFAULT 0,
                scan_confidence REAL DEFAULT 0.5,
                is_installed INTEGER DEFAULT 1,
                is_favorite INTEGER DEFAULT 0,
                is_hidden INTEGER DEFAULT 0,
                playtime_seconds INTEGER DEFAULT 0,
                last_played TEXT,
                scanned_at TEXT NOT NULL
            );
        ").map_err(|e| e.to_string())?;

        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }

    pub fn get_installed_games(&self) -> Result<Vec<InstalledGame>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, name, version, developer, category, install_path, exe_path, cover, banner, icon, size_bytes, installed_at, last_played, play_time_seconds, is_favorite, tags, checksum FROM installed_games ORDER BY name"
        ).map_err(|e| e.to_string())?;

        let games = stmt.query_map([], |row| {
            Ok(InstalledGame {
                id: row.get(0)?,
                name: row.get(1)?,
                version: row.get(2)?,
                developer: row.get(3)?,
                category: row.get(4)?,
                install_path: row.get(5)?,
                exe_path: row.get(6)?,
                cover: row.get(7)?,
                banner: row.get(8)?,
                icon: row.get(9)?,
                size_bytes: row.get(10)?,
                installed_at: row.get(11)?,
                last_played: row.get(12)?,
                play_time_seconds: row.get(13)?,
                is_favorite: row.get::<_, i32>(14)? != 0,
                tags: row.get(15)?,
                checksum: row.get(16)?,
            })
        }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

        Ok(games)
    }

    pub fn get_installed_game(&self, id: &str) -> Result<Option<InstalledGame>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, name, version, developer, category, install_path, exe_path, cover, banner, icon, size_bytes, installed_at, last_played, play_time_seconds, is_favorite, tags, checksum FROM installed_games WHERE id = ?1"
        ).map_err(|e| e.to_string())?;

        let mut games = stmt.query_map(params![id], |row| {
            Ok(InstalledGame {
                id: row.get(0)?,
                name: row.get(1)?,
                version: row.get(2)?,
                developer: row.get(3)?,
                category: row.get(4)?,
                install_path: row.get(5)?,
                exe_path: row.get(6)?,
                cover: row.get(7)?,
                banner: row.get(8)?,
                icon: row.get(9)?,
                size_bytes: row.get(10)?,
                installed_at: row.get(11)?,
                last_played: row.get(12)?,
                play_time_seconds: row.get(13)?,
                is_favorite: row.get::<_, i32>(14)? != 0,
                tags: row.get(15)?,
                checksum: row.get(16)?,
            })
        }).map_err(|e| e.to_string())?;

        match games.next() {
            Some(g) => Ok(Some(g.map_err(|e| e.to_string())?)),
            None => Ok(None),
        }
    }

    pub fn install_game(&self, game: &InstalledGame) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO installed_games (id, name, version, developer, category, install_path, exe_path, cover, banner, icon, size_bytes, installed_at, last_played, play_time_seconds, is_favorite, tags, checksum) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            params![
                game.id, game.name, game.version, game.developer, game.category,
                game.install_path, game.exe_path, game.cover, game.banner, game.icon,
                game.size_bytes, game.installed_at, game.last_played, game.play_time_seconds,
                game.is_favorite as i32, game.tags, game.checksum,
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn uninstall_game(&self, id: &str) -> Result<Option<InstalledGame>, String> {
        let game = self.get_installed_game(id)?;
        if let Some(ref g) = game {
            let install_path = std::path::Path::new(&g.install_path);
            if install_path.exists() {
                let _ = std::fs::remove_dir_all(install_path);
            }
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM installed_games WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(game)
    }

    pub fn update_last_played(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = chrono_now();
        conn.execute(
            "UPDATE installed_games SET last_played = ?1 WHERE id = ?2",
            params![now, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_exe_path(&self, id: &str, exe_path: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE installed_games SET exe_path = ?1 WHERE id = ?2",
            params![exe_path, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn toggle_favorite(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE installed_games SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?1",
            params![id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn add_download(&self, item: &DownloadItem) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO downloads (id, store_item_id, name, download_url, dest_path, status, progress, speed_bytes, downloaded_bytes, total_bytes, error, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                item.id, item.store_item_id, item.name, item.download_url, item.dest_path,
                item.status, item.progress, item.speed_bytes as i64, item.downloaded_bytes as i64,
                item.total_bytes as i64, item.error, item.created_at,
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_download(&self, id: &str, status: &str, progress: f64, downloaded: u64, speed: u64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE downloads SET status = ?1, progress = ?2, downloaded_bytes = ?3, speed_bytes = ?4 WHERE id = ?5",
            params![status, progress, downloaded as i64, speed as i64, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn remove_download(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM downloads WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_download_error(&self, id: &str, error: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE downloads SET error = ?1 WHERE id = ?2",
            params![error, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_downloads(&self) -> Result<Vec<DownloadItem>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, store_item_id, name, download_url, dest_path, status, progress, speed_bytes, downloaded_bytes, total_bytes, error, created_at FROM downloads ORDER BY created_at DESC"
        ).map_err(|e| e.to_string())?;

        let items = stmt.query_map([], |row| {
            Ok(DownloadItem {
                id: row.get(0)?,
                store_item_id: row.get(1)?,
                name: row.get(2)?,
                download_url: row.get(3)?,
                dest_path: row.get(4)?,
                status: row.get(5)?,
                progress: row.get(6)?,
                speed_bytes: row.get::<_, i64>(7)? as u64,
                downloaded_bytes: row.get::<_, i64>(8)? as u64,
                total_bytes: row.get::<_, i64>(9)? as u64,
                error: row.get(10)?,
                created_at: row.get(11)?,
            })
        }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

        Ok(items)
    }

    // ── Users ──
    pub fn create_user(&self, username: &str, email: &str, password_hash: &str) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = chrono_now();
        conn.execute(
            "INSERT INTO users (username, email, password_hash, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![username, email, password_hash, now],
        ).map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_user_by_email(&self, email: &str) -> Result<Option<(i64, String, String, String, String)>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, username, email, password_hash, created_at FROM users WHERE email = ?1"
        ).map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map([email], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        }).map_err(|e| e.to_string())?;
        match rows.next() {
            Some(row) => Ok(Some(row.map_err(|e| e.to_string())?)),
            None => Ok(None),
        }
    }

    pub fn get_user_by_username(&self, username: &str) -> Result<Option<(i64, String, String, String, String)>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, username, email, password_hash, created_at FROM users WHERE username = ?1"
        ).map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map([username], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        }).map_err(|e| e.to_string())?;
        match rows.next() {
            Some(row) => Ok(Some(row.map_err(|e| e.to_string())?)),
            None => Ok(None),
        }
    }

    // ── Recently Launched ──
    pub fn add_recently_launched(&self, game_name: &str, exe_path: &str, install_path: Option<&str>, game_id: Option<&str>) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = chrono_now();
        // Remove old entry for same game to avoid duplicates
        conn.execute("DELETE FROM recently_launched WHERE game_name = ?1", params![game_name]).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO recently_launched (game_name, exe_path, install_path, game_id, launched_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![game_name, exe_path, install_path, game_id, now],
        ).map_err(|e| e.to_string())?;
        // Keep only last 10
        conn.execute("DELETE FROM recently_launched WHERE id NOT IN (SELECT id FROM recently_launched ORDER BY launched_at DESC LIMIT 10)", []).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_recently_launched(&self) -> Result<Vec<(String, String, Option<String>, Option<String>, String)>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT game_name, exe_path, install_path, game_id, launched_at FROM recently_launched ORDER BY launched_at DESC LIMIT 10"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn change_password(&self, user_id: i64, new_hash: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE users SET password_hash = ?1 WHERE id = ?2",
            params![new_hash, user_id.to_string()],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn change_email(&self, user_id: i64, new_email: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE users SET email = ?1 WHERE id = ?2",
            params![new_email, user_id.to_string()],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn verify_password(&self, user_id: i64, password_hash: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT password_hash FROM users WHERE id = ?1").map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map([user_id.to_string()], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(hash)) => Ok(hash == password_hash),
            _ => Ok(false),
        }
    }

    // Scanned Games methods

    pub fn save_scanned_games(&self, games: &[ScannedGameRow]) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM scanned_games", []).map_err(|e| e.to_string())?;
        let now = chrono_now();
        for game in games {
            conn.execute(
                "INSERT INTO scanned_games (id, name, platform, launcher, install_path, exe_path, app_id, version, cover_path, cover_local, icon_local, install_size, scan_confidence, is_installed, is_favorite, is_hidden, playtime_seconds, last_played, scanned_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
                params![
                    game.id, game.name, game.platform, game.launcher, game.install_path,
                    game.exe_path, game.app_id, game.version, game.cover_path, game.cover_local,
                    game.icon_local, game.install_size, game.scan_confidence, game.is_installed as i32,
                    game.is_favorite as i32, game.is_hidden as i32, game.playtime_seconds,
                    game.last_played, now,
                ],
            ).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn get_scanned_games(&self) -> Result<Vec<ScannedGameRow>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, name, platform, launcher, install_path, exe_path, app_id, version, cover_path, cover_local, icon_local, install_size, scan_confidence, is_installed, is_favorite, is_hidden, playtime_seconds, last_played, scanned_at FROM scanned_games ORDER BY name"
        ).map_err(|e| e.to_string())?;

        let games = stmt.query_map([], |row| {
            Ok(ScannedGameRow {
                id: row.get(0)?,
                name: row.get(1)?,
                platform: row.get(2)?,
                launcher: row.get(3)?,
                install_path: row.get(4)?,
                exe_path: row.get(5)?,
                app_id: row.get(6)?,
                version: row.get(7)?,
                cover_path: row.get(8)?,
                cover_local: row.get(9)?,
                icon_local: row.get(10)?,
                install_size: row.get(11)?,
                scan_confidence: row.get(12)?,
                is_installed: row.get::<_, i32>(13)? != 0,
                is_favorite: row.get::<_, i32>(14)? != 0,
                is_hidden: row.get::<_, i32>(15)? != 0,
                playtime_seconds: row.get(16)?,
                last_played: row.get(17)?,
                scanned_at: row.get(18)?,
            })
        }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

        Ok(games)
    }

    pub fn toggle_scanned_game_favorite(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE scanned_games SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?1",
            params![id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn toggle_scanned_game_hidden(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE scanned_games SET is_hidden = CASE WHEN is_hidden = 1 THEN 0 ELSE 1 END WHERE id = ?1",
            params![id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_scanned_game_playtime(&self, id: &str, seconds: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = chrono_now();
        conn.execute(
            "UPDATE scanned_games SET playtime_seconds = ?1, last_played = ?2 WHERE id = ?3",
            params![seconds, now, id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedGameRow {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub launcher: String,
    pub install_path: String,
    pub exe_path: Option<String>,
    pub app_id: Option<String>,
    pub version: Option<String>,
    pub cover_path: Option<String>,
    pub cover_local: Option<String>,
    pub icon_local: Option<String>,
    pub install_size: i64,
    pub scan_confidence: f32,
    pub is_installed: bool,
    pub is_favorite: bool,
    pub is_hidden: bool,
    pub playtime_seconds: i64,
    pub last_played: Option<String>,
    pub scanned_at: String,
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!("{}", secs)
}
