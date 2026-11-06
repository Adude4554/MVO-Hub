//! Tauri IPC surface for Cloud Saves & Achievements.
//!
//! Every command is a thin wrapper over the testable functions in
//! [`super::sync`], [`super::db`] and [`super::achievements`]. Commands that
//! mutate state emit an event so the UI can update without polling.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::app_data_dir;

use super::achievements::{self, AchievementDefinition, AchievementState, UnlockResult};
use super::db::{CloudDb, CloudSaveRecord, ConflictResolution, SaveConflict};
use super::sync::{self, SyncStatus, SyncSummary};
use super::Achievement;

/// Events emitted after a successful mutation.
pub const EVENT_ACHIEVEMENT_UNLOCKED: &str = "cloud:achievement-unlocked";
pub const EVENT_SAVES_SYNCED: &str = "cloud:saves-synced";
pub const EVENT_CONFLICT: &str = "cloud:save-conflict";

fn db() -> Result<CloudDb, String> {
    CloudDb::open(&app_data_dir())
}

/// Re-scan a game's save files and queue anything that changed.
#[tauri::command]
pub fn cloud_scan_saves(
    app: AppHandle,
    game_id: String,
    game_name: String,
    paths: Vec<String>,
) -> Result<SyncSummary, String> {
    let database = db()?;
    let summary = sync::scan_saves(&database, &game_id, &game_name, &paths)?;

    emit(
        &app,
        EVENT_SAVES_SYNCED,
        serde_json::json!({
            "gameId": game_id,
            "scanned": summary.scanned,
            "changed": summary.changed,
            "queued": summary.queued,
        }),
    );
    for conflict in &summary.conflicts {
        emit(&app, EVENT_CONFLICT, serde_json::json!({ "gameId": game_id, "path": conflict }));
    }
    Ok(summary)
}

/// Every tracked save file.
#[tauri::command]
pub fn cloud_list_saves() -> Result<Vec<CloudSaveRecord>, String> {
    db()?.list_saves()
}

/// Saves belonging to one game.
#[tauri::command]
pub fn cloud_list_game_saves(game_id: String) -> Result<Vec<CloudSaveRecord>, String> {
    db()?.saves_for_game(&game_id)
}

/// Saves that diverged and need a user decision.
#[tauri::command]
pub fn cloud_detect_conflicts() -> Result<Vec<SaveConflict>, String> {
    db()?.detect_conflicts()
}

/// Resolve a conflict by keeping the local copy, the remote copy, or both.
#[tauri::command]
pub fn cloud_resolve_conflict(
    game_id: String,
    local_path: String,
    resolution: ConflictResolution,
) -> Result<(), String> {
    db()?.resolve_conflict(&game_id, &local_path, resolution)
}

/// Flush the upload queue and return when it happened.
#[tauri::command]
pub fn cloud_sync_now(app: AppHandle) -> Result<SyncStatus, String> {
    let database = db()?;
    let (uploaded, at) = sync::sync_now(&database)?;
    let status = sync::build_status(&database)?;

    emit(
        &app,
        EVENT_SAVES_SYNCED,
        serde_json::json!({ "uploaded": uploaded, "syncedAt": at }),
    );
    Ok(status)
}

/// Aggregate sync + achievement snapshot for the Cloud & Achievements view.
#[tauri::command]
pub fn cloud_get_status() -> Result<SyncStatus, String> {
    sync::build_status(&db()?)
}

// -- achievements -----------------------------------------------------------

/// Register a game's achievement list.
#[tauri::command]
pub fn achievements_register(
    game_id: String,
    definitions: Vec<AchievementDefinition>,
) -> Result<usize, String> {
    achievements::register_definitions(&db()?, &game_id, &definitions)
}

/// Unlock an achievement and queue it for upload.
#[tauri::command]
pub fn achievements_unlock(app: AppHandle, achievement_id: String) -> Result<UnlockResult, String> {
    let result = achievements::unlock(&db()?, &achievement_id)?;
    if result.newly_unlocked {
        emit(
            &app,
            EVENT_ACHIEVEMENT_UNLOCKED,
            serde_json::json!({
                "achievementId": result.achievement.id,
                "gameId": result.achievement.game_id,
                "name": result.achievement.name,
                "points": result.achievement.points,
            }),
        );
    }
    Ok(result)
}

/// All achievements, or just one game's when `game_id` is supplied.
#[tauri::command]
pub fn achievements_list(game_id: Option<String>) -> Result<Vec<Achievement>, String> {
    let database = db()?;
    match game_id {
        Some(id) => achievements::list_for_game(&database, &id),
        None => achievements::list_all(&database),
    }
}

/// Unlock progress for one game (or overall when omitted).
#[tauri::command]
pub fn achievements_state(game_id: Option<String>) -> Result<AchievementState, String> {
    let database = db()?;
    match game_id {
        Some(id) => achievements::state_for_game(&database, &id),
        None => achievements::overall_state(&database),
    }
}

fn emit<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    let _ = app.emit(event, payload);
}
