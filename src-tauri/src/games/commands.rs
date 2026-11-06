//! Tauri IPC surface for advanced game management.
//!
//! Thin wrappers over [`super::GameStore`], [`super::process`] and
//! [`super::sessions`]. The two `launch_game_with_args` / `poll_game_processes`
//! commands are the backbone of playtime tracking: launch registers the game
//! with the monitor, polling advances the state machine and persists sessions.

use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::app_data_dir;
use crate::gamevault::db::GameVaultDb;

use super::process::{live_names, ActiveGame, ProcessState, SystemProcessSource};
use super::sessions::{self, PlaytimeStats};
use super::{
    build_launch_spec, DetectedGame, GameConfig, GameConfigPatch, GameStore, ImageKind, LaunchSpec,
    SessionRow, EXIT_GRACE_SECS,
};

pub const EVENT_GAME_STARTED: &str = "games:session-started";
pub const EVENT_GAME_ENDED: &str = "games:session-ended";

fn store() -> Result<GameStore, String> {
    GameStore::open(&app_data_dir())
}

/// Find a game's scanner row so overrides can be applied on top of it.
fn detected_game(game_id: &str) -> Result<DetectedGame, String> {
    let db = GameVaultDb::new(&app_data_dir())?;
    let row = db
        .get_scanned_games()?
        .into_iter()
        .find(|g| g.id == game_id)
        .ok_or_else(|| format!("Unknown game '{}'", game_id))?;

    Ok(DetectedGame {
        game_id: row.id,
        name: row.name,
        exe_path: row.exe_path,
        install_path: row.install_path,
        working_dir: row.working_dir,
        banner_path: None,
        cover_path: row.cover_local.or(row.cover_path),
    })
}

/// Current configuration for one game (synthesised if never configured).
#[tauri::command]
pub fn get_game_config(game_id: String) -> Result<GameConfig, String> {
    store()?.get_config(&game_id)
}

/// Patch one or more fields of a game's configuration.
#[tauri::command]
pub fn update_game_config(game_id: String, patch: GameConfigPatch) -> Result<GameConfig, String> {
    store()?.update_config(&game_id, patch)
}

/// Resolve the exact command line that would be launched.
#[tauri::command]
pub fn get_launch_spec(game_id: String) -> Result<LaunchSpec, String> {
    let detected = detected_game(&game_id)?;
    let config = store()?.get_config(&game_id)?;
    build_launch_spec(&detected, &config, |p| p.exists()).map_err(|e| e.to_string())
}

/// Launch a game with its saved arguments/overrides, and begin tracking it.
#[tauri::command]
pub fn launch_game_with_args(app: AppHandle, game_id: String) -> Result<LaunchSpec, String> {
    let detected = detected_game(&game_id)?;
    let db = store()?;
    let config = db.get_config(&game_id)?;
    let spec = build_launch_spec(&detected, &config, |p| p.exists()).map_err(|e| e.to_string())?;

    let mut cmd = std::process::Command::new(&spec.exe_path);
    if let Some(dir) = &spec.working_dir {
        cmd.current_dir(dir);
    }
    if !spec.args.is_empty() {
        cmd.args(&spec.args);
    }
    cmd.spawn().map_err(|e| format!("Failed to launch: {}", e))?;

    // Stamp the attempt so "last played" moves even if the process dies instantly.
    db.add_playtime(&game_id, 0)?;

    if let Ok(mut monitor) = sessions::monitor().lock() {
        monitor.track(&game_id, &detected.name, &spec.exe_path);
    }

    emit(
        &app,
        EVENT_GAME_STARTED,
        serde_json::json!({
            "gameId": game_id,
            "gameName": detected.name,
            "exePath": spec.exe_path,
            "args": spec.args,
        }),
    );
    Ok(spec)
}

/// One polling cycle: advance the monitor, persist finished sessions, and emit
/// an event per session that ended.
///
/// Kept as a plain function (not a `#[tauri::command]`) so the background
/// playtime ticker in `setup()` and the IPC command share exactly one
/// implementation — they cannot drift in how a session is recorded.
pub fn run_process_poll(app: &AppHandle) -> Result<Vec<ActiveGame>, String> {
    let live = live_names(&SystemProcessSource);
    let (finished, active) = {
        let mut monitor = sessions::monitor()
            .lock()
            .map_err(|_| "process monitor poisoned".to_string())?;
        let finished = monitor.poll(&live, Duration::from_secs(EXIT_GRACE_SECS));
        let active = monitor.active();
        (finished, active)
    };

    // Only touch the database when a session actually ended, so an idle ticker
    // costs no disk I/O.
    if !finished.is_empty() {
        let db = store()?;
        sessions::persist_sessions(&db, &finished)?;
        for session in &finished {
            emit(
                app,
                EVENT_GAME_ENDED,
                serde_json::json!({
                    "gameId": session.game_id,
                    "durationSeconds": session.duration_seconds,
                }),
            );
        }
    }

    Ok(active)
}

/// Poll the process list and persist any finished sessions.
#[tauri::command]
pub fn poll_game_processes(app: AppHandle) -> Result<Vec<ActiveGame>, String> {
    run_process_poll(&app)
}

/// Games currently tracked by the monitor.
#[tauri::command]
pub fn get_active_games() -> Result<Vec<ActiveGame>, String> {
    let monitor = sessions::monitor()
        .lock()
        .map_err(|_| "process monitor poisoned".to_string())?;
    Ok(monitor.active())
}

/// Stop tracking a game and persist the session that just ended.
#[tauri::command]
pub fn stop_game_session(game_id: String) -> Result<PlaytimeStats, String> {
    let ended = {
        let mut monitor = sessions::monitor()
            .lock()
            .map_err(|_| "process monitor poisoned".to_string())?;
        monitor.stop(&game_id)
    };
    let db = store()?;
    if let Some(session) = &ended {
        sessions::persist_sessions(&db, std::slice::from_ref(session))?;
    }
    sessions::playtime_stats(&db, &game_id)
}

/// Playtime totals, session count and recent sessions for one game.
#[tauri::command]
pub fn get_game_playtime(game_id: String) -> Result<PlaytimeStats, String> {
    sessions::playtime_stats(&store()?, &game_id)
}

/// Session history for one game, newest first.
#[tauri::command]
pub fn get_game_sessions(game_id: String, limit: Option<usize>) -> Result<Vec<SessionRow>, String> {
    store()?.recent_sessions(&game_id, limit.unwrap_or(20))
}

/// Snapshot of the monitor's view of a game, if tracked.
#[tauri::command]
pub fn get_game_process_state(game_id: String) -> Result<Option<ProcessState>, String> {
    let monitor = sessions::monitor()
        .lock()
        .map_err(|_| "process monitor poisoned".to_string())?;
    Ok(monitor
        .active()
        .into_iter()
        .find(|g| g.game_id == game_id)
        .map(|g| g.state))
}

/// Upload a custom cover or banner (base64-encoded image bytes).
#[tauri::command]
pub fn upload_game_image(
    game_id: String,
    kind: ImageKind,
    data_base64: String,
) -> Result<GameConfig, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|_| "Image data is not valid base64".to_string())?;

    let db = store()?;
    let path = db.save_custom_image(&app_data_dir(), &game_id, kind, &bytes)?;

    let patch = match kind {
        ImageKind::Cover => GameConfigPatch {
            custom_cover: Some(path),
            ..Default::default()
        },
        ImageKind::Banner => GameConfigPatch {
            custom_banner: Some(path),
            ..Default::default()
        },
    };
    db.update_config(&game_id, patch)
}

fn emit<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    let _ = app.emit(event, payload);
}
