//! Achievement tracking.
//!
//! Unlocks are recorded locally first (source of truth offline) and queued for
//! upload. Recording is idempotent: unlocking the same achievement twice keeps
//! the original timestamp, which matters because games routinely re-report
//! achievements on every launch.

use serde::{Deserialize, Serialize};

use super::{now_iso, CloudDb};

/// A game's declared achievement, as shipped in its metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementDefinition {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub points: i64,
}

/// An achievement plus this user's unlock state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub id: String,
    pub game_id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub points: i64,
    pub unlocked: bool,
    pub unlocked_at: Option<String>,
    pub recorded_at: String,
}

/// Alias kept for callers that think in "records".
pub type AchievementRecord = Achievement;

/// Aggregate unlock state for one game.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementState {
    pub game_id: String,
    pub total: usize,
    pub unlocked: usize,
    pub points_unlocked: i64,
    pub points_total: i64,
    /// 0-100, rounded down.
    pub completion_percent: u8,
}

impl AchievementState {
    fn from(rows: &[Achievement], game_id: &str) -> Self {
        let total = rows.len();
        let unlocked_rows: Vec<&Achievement> = rows.iter().filter(|a| a.unlocked).collect();
        let unlocked = unlocked_rows.len();
        let points_unlocked = unlocked_rows.iter().map(|a| a.points).sum();
        let points_total = rows.iter().map(|a| a.points).sum();
        let completion_percent = if total == 0 {
            0
        } else {
            ((unlocked * 100) / total) as u8
        };
        Self {
            game_id: game_id.to_string(),
            total,
            unlocked,
            points_unlocked,
            points_total,
            completion_percent,
        }
    }
}

/// The outcome of an unlock request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockResult {
    /// True only the first time an achievement is unlocked.
    pub newly_unlocked: bool,
    pub achievement: Achievement,
    /// True when the unlock was queued for cloud upload.
    pub queued: bool,
}

/// Register a game's achievement definitions without clobbering unlock state.
pub fn register_definitions(
    db: &CloudDb,
    game_id: &str,
    definitions: &[AchievementDefinition],
) -> Result<usize, String> {
    let conn = db.connection()?;
    let now = now_iso();
    let mut written = 0usize;
    for def in definitions {
        if def.id.trim().is_empty() {
            return Err("Achievement id must not be empty".into());
        }
        // Metadata refresh must not resurrect an unlock or reset its timestamp.
        written += conn
            .execute(
                "INSERT INTO achievements
                    (id, game_id, name, description, icon, points, unlocked, unlocked_at, recorded_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, NULL, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                    game_id = excluded.game_id,
                    name = excluded.name,
                    description = excluded.description,
                    icon = excluded.icon,
                    points = excluded.points",
                rusqlite::params![
                    def.id,
                    game_id,
                    def.name,
                    def.description,
                    def.icon,
                    def.points,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(written)
}

/// Unlock an achievement and queue it for upload.
pub fn unlock(db: &CloudDb, achievement_id: &str) -> Result<UnlockResult, String> {
    let at = now_iso();
    let newly_unlocked = {
        let conn = db.connection()?;
        conn.execute(
            "UPDATE achievements SET unlocked = 1, unlocked_at = ?1
             WHERE id = ?2 AND unlocked = 0",
            rusqlite::params![at, achievement_id],
        )
        .map_err(|e| e.to_string())?
            > 0
    };

    let achievement = get(db, achievement_id)?
        .ok_or_else(|| format!("Unknown achievement '{}'", achievement_id))?;

    // Queueing is idempotent, so a repeat unlock is harmless but the caller can
    // still distinguish "first time" from "already had it".
    let payload = serde_json::json!({
        "achievementId": achievement.id,
        "gameId": achievement.game_id,
        "unlockedAt": achievement.unlocked_at,
    })
    .to_string();
    db.enqueue("achievement", &achievement.id, &payload)?;

    Ok(UnlockResult { newly_unlocked, achievement, queued: true })
}

pub fn get(db: &CloudDb, achievement_id: &str) -> Result<Option<Achievement>, String> {
    let conn = db.connection()?;
    conn.query_row(
        "SELECT id, game_id, name, description, icon, points, unlocked, unlocked_at, recorded_at
         FROM achievements WHERE id = ?1",
        rusqlite::params![achievement_id],
        map_achievement,
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Every achievement for a game, unlocked first then alphabetically.
pub fn list_for_game(db: &CloudDb, game_id: &str) -> Result<Vec<Achievement>, String> {
    let conn = db.connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, game_id, name, description, icon, points, unlocked, unlocked_at, recorded_at
             FROM achievements WHERE game_id = ?1
             ORDER BY unlocked DESC, name ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![game_id], map_achievement)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Every achievement across every game.
pub fn list_all(db: &CloudDb) -> Result<Vec<Achievement>, String> {
    let conn = db.connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, game_id, name, description, icon, points, unlocked, unlocked_at, recorded_at
             FROM achievements ORDER BY unlocked DESC, game_id ASC, name ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_achievement).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn state_for_game(db: &CloudDb, game_id: &str) -> Result<AchievementState, String> {
    let rows = list_for_game(db, game_id)?;
    Ok(AchievementState::from(&rows, game_id))
}

pub fn overall_state(db: &CloudDb) -> Result<AchievementState, String> {
    let rows = list_all(db)?;
    Ok(AchievementState::from(&rows, "*"))
}

fn map_achievement(row: &rusqlite::Row<'_>) -> rusqlite::Result<Achievement> {
    Ok(Achievement {
        id: row.get(0)?,
        game_id: row.get(1)?,
        name: row.get(2)?,
        description: row.get(3)?,
        icon: row.get(4)?,
        points: row.get(5)?,
        unlocked: row.get::<_, i64>(6)? != 0,
        unlocked_at: row.get(7)?,
        recorded_at: row.get(8)?,
    })
}

use rusqlite::OptionalExtension;

#[cfg(test)]
mod tests {
    use super::*;

    fn def(id: &str, points: i64) -> AchievementDefinition {
        AchievementDefinition {
            id: id.to_string(),
            name: format!("Achievement {}", id),
            description: "desc".into(),
            icon: "trophy".into(),
            points,
        }
    }

    fn seeded() -> CloudDb {
        let db = CloudDb::in_memory().unwrap();
        register_definitions(&db, "g1", &[def("a1", 10), def("a2", 20), def("a3", 30)]).unwrap();
        db
    }

    #[test]
    fn registering_definitions_starts_locked() {
        let db = seeded();
        let rows = list_for_game(&db, "g1").unwrap();
        assert_eq!(rows.len(), 3);
        assert!(rows.iter().all(|a| !a.unlocked));
        assert!(rows.iter().all(|a| a.unlocked_at.is_none()));
    }

    #[test]
    fn register_rejects_blank_ids() {
        let db = CloudDb::in_memory().unwrap();
        let err = register_definitions(&db, "g1", &[def("  ", 1)]).unwrap_err();
        assert!(err.contains("must not be empty"));
    }

    #[test]
    fn unlock_records_timestamp_and_queues_upload() {
        let db = seeded();
        assert_eq!(db.pending_count().unwrap(), 0);

        let result = unlock(&db, "a1").unwrap();
        assert!(result.newly_unlocked);
        assert!(result.queued);
        assert!(result.achievement.unlocked);
        assert!(result.achievement.unlocked_at.is_some());
        assert_eq!(db.pending_count().unwrap(), 1);
    }

    #[test]
    fn unlocking_twice_keeps_the_original_timestamp() {
        let db = seeded();
        let first = unlock(&db, "a1").unwrap();
        let second = unlock(&db, "a1").unwrap();

        assert!(first.newly_unlocked);
        assert!(!second.newly_unlocked, "second unlock should not be 'new'");
        assert_eq!(
            first.achievement.unlocked_at, second.achievement.unlocked_at,
            "the first unlock time is authoritative"
        );
        assert_eq!(db.pending_count().unwrap(), 1, "queue must not duplicate");
    }

    #[test]
    fn unlocking_unknown_achievement_errors() {
        let db = seeded();
        let err = unlock(&db, "nope").unwrap_err();
        assert!(err.contains("Unknown achievement"));
    }

    #[test]
    fn metadata_refresh_preserves_unlock_state() {
        let db = seeded();
        unlock(&db, "a2").unwrap();

        // Ship a rename / new points for an already-unlocked achievement.
        let mut renamed = def("a2", 25);
        renamed.name = "Renamed".into();
        register_definitions(&db, "g1", &[renamed]).unwrap();

        let row = get(&db, "a2").unwrap().unwrap();
        assert_eq!(row.name, "Renamed");
        assert_eq!(row.points, 25);
        assert!(row.unlocked, "a metadata refresh must not re-lock achievements");
        assert!(row.unlocked_at.is_some());
    }

    #[test]
    fn state_counts_unlocks_and_points() {
        let db = seeded();
        unlock(&db, "a1").unwrap();
        unlock(&db, "a3").unwrap();

        let state = state_for_game(&db, "g1").unwrap();
        assert_eq!(state.total, 3);
        assert_eq!(state.unlocked, 2);
        assert_eq!(state.points_unlocked, 40);
        assert_eq!(state.points_total, 60);
        assert_eq!(state.completion_percent, 66);
    }

    #[test]
    fn empty_state_is_zeroed_not_a_divide_by_zero() {
        let db = CloudDb::in_memory().unwrap();
        let state = state_for_game(&db, "nothing").unwrap();
        assert_eq!(state.total, 0);
        assert_eq!(state.completion_percent, 0);
    }

    #[test]
    fn full_completion_is_one_hundred_percent() {
        let db = seeded();
        for id in ["a1", "a2", "a3"] {
            unlock(&db, id).unwrap();
        }
        let state = state_for_game(&db, "g1").unwrap();
        assert_eq!(state.completion_percent, 100);
        assert_eq!(state.unlocked, 3);
    }

    #[test]
    fn listing_puts_unlocked_first() {
        let db = seeded();
        unlock(&db, "a3").unwrap();
        let rows = list_for_game(&db, "g1").unwrap();
        assert_eq!(rows[0].id, "a3");
        assert!(rows[0].unlocked);
    }

    #[test]
    fn overall_state_spans_games() {
        let db = CloudDb::in_memory().unwrap();
        register_definitions(&db, "g1", &[def("a1", 10)]).unwrap();
        register_definitions(&db, "g2", &[def("b1", 5)]).unwrap();
        unlock(&db, "a1").unwrap();

        let overall = overall_state(&db).unwrap();
        assert_eq!(overall.total, 2);
        assert_eq!(overall.unlocked, 1);
        assert_eq!(overall.game_id, "*");
    }

    #[test]
    fn locked_and_unlocked_are_ordered_per_game() {
        let db = seeded();
        unlock(&db, "a1").unwrap();
        let g2 = register_definitions(&db, "g2", &[def("z1", 1)]);
        assert!(g2.is_ok());
        assert_eq!(list_for_game(&db, "g1").unwrap().len(), 3);
        assert_eq!(list_all(&db).unwrap().len(), 4);
    }
}

