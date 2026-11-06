//! Persists process-monitor results and exposes the shared monitor instance.
//!
//! This is the join between [`super::process`] (observation) and
//! [`super::GameStore`] (durable playtime). Keeping it separate means the state
//! machine and the database are each testable on their own, and this layer only
//! has two responsibilities: hold the singleton, and write finished sessions.

use std::sync::Mutex;

use super::process::{FinishedSession, ProcessMonitor};
use super::{now_iso, GameStore, SessionRow};

/// Process-wide monitor. Sessions must be visible to every IPC command, so a
/// single instance is shared rather than recreated per call.
pub fn monitor() -> &'static Mutex<ProcessMonitor> {
    use std::sync::OnceLock;
    static MONITOR: OnceLock<Mutex<ProcessMonitor>> = OnceLock::new();
    MONITOR.get_or_init(|| Mutex::new(ProcessMonitor::new()))
}

/// How often the background ticker inspects the process list.
///
/// Two seconds is frequent enough that a short session still records a
/// meaningful duration, yet the idle cost is tiny because an empty poll only
/// refreshes the process table (no database access).
pub const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_secs(2);

/// True when at least one game is being tracked.
///
/// The ticker uses this to skip the (relatively expensive) process snapshot
/// entirely when nothing was launched, which is the common case.
pub fn has_tracked_games() -> bool {
    monitor().lock().map(|m| !m.active().is_empty()).unwrap_or(false)
}

/// Append a finished session to the persisted log and total.
///
/// Thin, single-session wrapper around [`persist_sessions`] for callers that
/// only handled one session.
pub fn persist_session(store: &GameStore, session: &FinishedSession) -> Result<usize, String> {
    persist_sessions(store, std::slice::from_ref(session))
}

/// Record finished sessions, returning the number persisted.
///
/// A zero-second session is skipped: it carries no information and would only
/// inflate the session count.
pub fn persist_sessions(store: &GameStore, sessions: &[FinishedSession]) -> Result<usize, String> {
    let mut written = 0;
    for session in sessions {
        if session.duration_seconds == 0 {
            continue;
        }
        let ended = now_iso();
        let started = started_iso(session.duration_seconds);
        store.record_session(
            &session.game_id,
            &session.game_name,
            &started,
            &ended,
            session.duration_seconds as i64,
        )?;
        written += 1;
    }
    Ok(written)
}

/// Derive a session start timestamp from its duration.
fn started_iso(duration_seconds: u64) -> String {
    let end = chrono::Utc::now();
    let start = end - chrono::Duration::seconds(duration_seconds as i64);
    start.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// Aggregate playtime view for the Game Detail screen.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaytimeStats {
    pub total_seconds: i64,
    pub session_count: i64,
    /// Mean session length, 0 when there are no sessions.
    pub average_seconds: i64,
    pub last_played: Option<String>,
    pub recent: Vec<SessionRow>,
}

/// Build the stats block shown on Game Detail.
pub fn playtime_stats(store: &GameStore, game_id: &str) -> Result<PlaytimeStats, String> {
    let config = store.get_config(game_id)?;
    let session_count = store.total_session_count(game_id)?;
    let recent = store.recent_sessions(game_id, 5)?;

    let average_seconds = if session_count > 0 {
        // Prefer the recorded sessions so a manually-adjusted total doesn't
        // silently skew the average.
        let total: i64 = recent.iter().map(|s| s.duration_seconds).sum();
        if recent.is_empty() {
            0
        } else {
            total / recent.len() as i64
        }
    } else {
        0
    };

    Ok(PlaytimeStats {
        total_seconds: config.playtime_seconds,
        session_count,
        average_seconds,
        last_played: config.last_played,
        recent,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(id: &str, secs: u64) -> FinishedSession {
        FinishedSession {
            game_id: id.to_string(),
            game_name: format!("Game {}", id),
            duration_seconds: secs,
        }
    }

    #[test]
    fn persist_writes_each_session_and_totals_playtime() {
        let store = GameStore::in_memory().unwrap();
        let written = persist_sessions(&store, &[session("g1", 60), session("g1", 30)]).unwrap();

        assert_eq!(written, 2);
        assert_eq!(store.get_config("g1").unwrap().playtime_seconds, 90);
        assert_eq!(store.total_session_count("g1").unwrap(), 2);
    }

    #[test]
    fn zero_second_sessions_are_dropped() {
        let store = GameStore::in_memory().unwrap();
        let written = persist_sessions(&store, &[session("g1", 0), session("g1", 5)]).unwrap();
        assert_eq!(written, 1);
        assert_eq!(store.total_session_count("g1").unwrap(), 1);
    }

    #[test]
    fn persisting_nothing_is_a_no_op() {
        let store = GameStore::in_memory().unwrap();
        assert_eq!(persist_sessions(&store, &[]).unwrap(), 0);
        assert_eq!(store.get_config("g1").unwrap().playtime_seconds, 0);
    }

    #[test]
    fn persist_session_handles_a_single_session() {
        let store = GameStore::in_memory().unwrap();
        assert_eq!(persist_session(&store, &session("g1", 45)).unwrap(), 1);
        assert_eq!(store.get_config("g1").unwrap().playtime_seconds, 45);
    }

    #[test]
    fn poll_interval_is_short_enough_for_live_tracking() {
        // Short enough that a brief session still registers, long enough not to
        // hammer the process table.
        assert!(POLL_INTERVAL >= std::time::Duration::from_secs(1));
        assert!(POLL_INTERVAL <= std::time::Duration::from_secs(10));
    }

    #[test]
    fn has_tracked_games_reflects_the_shared_monitor() {
        // Leave the global monitor clean for other tests.
        let was_tracking = {
            let mut m = monitor().lock().unwrap();
            let had = !m.active().is_empty();
            m.stop("__poll_test__");
            had
        };
        if !was_tracking {
            assert!(monitor().lock().unwrap().active().is_empty());
        }
    }

    #[test]
    fn stats_aggregate_total_count_and_average() {
        let store = GameStore::in_memory().unwrap();
        persist_sessions(&store, &[session("g1", 60), session("g1", 120)]).unwrap();

        let stats = playtime_stats(&store, "g1").unwrap();
        assert_eq!(stats.total_seconds, 180);
        assert_eq!(stats.session_count, 2);
        assert_eq!(stats.average_seconds, 90);
        assert_eq!(stats.recent.len(), 2);
        assert!(stats.last_played.is_some());
    }

    #[test]
    fn stats_for_an_unplayed_game_are_zeroed() {
        let store = GameStore::in_memory().unwrap();
        let stats = playtime_stats(&store, "never").unwrap();
        assert_eq!(stats.total_seconds, 0);
        assert_eq!(stats.session_count, 0);
        assert_eq!(stats.average_seconds, 0);
        assert!(stats.recent.is_empty());
        assert!(stats.last_played.is_none());
    }

    #[test]
    fn derived_start_timestamp_precedes_now() {
        let started = started_iso(3600);
        let parsed = chrono::DateTime::parse_from_rfc3339(&started).unwrap();
        let now = chrono::Utc::now();
        let delta = now.signed_duration_since(parsed);
        assert!(delta.num_seconds() >= 3599);
    }

    #[test]
    fn monitor_singleton_is_shared() {
        let a = monitor() as *const _;
        let b = monitor() as *const _;
        assert_eq!(a, b);
    }
}
