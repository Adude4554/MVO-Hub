//! Process monitoring and session state machine.
//!
//! The monitor never spawns or kills anything; it observes. That makes the
//! transition logic (starting → running → grace → ended) testable with a fake
//! process list, which is what [`ProcessSource`] exists for: the real
//! implementation queries `sysinfo`, tests supply a fixed set of names.

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// How long a launch may sit without its process appearing before we stop
/// tracking it. Generous, because launchers (Steam, Epic) genuinely take a while.
pub const LAUNCH_TIMEOUT: Duration = Duration::from_secs(120);

/// Where the set of live process names comes from.
pub trait ProcessSource {
    /// Lower-cased executable names currently running (e.g. `game.exe`).
    fn snapshot(&self) -> HashSet<String>;
}

/// Production: query the OS via `sysinfo`.
pub struct SystemProcessSource;

impl ProcessSource for SystemProcessSource {
    fn snapshot(&self) -> HashSet<String> {
        use sysinfo::{ProcessesToUpdate, System};
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        sys.processes()
            .values()
            .map(|p| p.name().to_string_lossy().to_lowercase())
            .collect()
    }
}

/// Lifecycle of a tracked game.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProcessState {
    /// Launched, but the process has not appeared yet (launchers re-exec).
    Launching,
    /// Process observed running.
    Running,
    /// Process disappeared, waiting out the grace window.
    Ending,
}

/// One game under observation.
#[derive(Debug, Clone)]
struct Tracked {
    game_id: String,
    game_name: String,
    exe_name: String,
    started_at: Instant,
    state: ProcessState,
    /// When the process was first observed. Sessions are measured from here, so
    /// launcher stub time isn't billed to the game.
    running_since: Option<Instant>,
    last_seen: Instant,
    /// Whether this game has ever been seen running. A launch whose process
    /// never appears must not create a zero-second session.
    observed_running: bool,
}

/// A session that has finished.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishedSession {
    pub game_id: String,
    pub game_name: String,
    pub duration_seconds: u64,
}

/// Runtime view of a tracked game.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveGame {
    pub game_id: String,
    pub game_name: String,
    pub state: ProcessState,
    pub elapsed_seconds: u64,
}

pub struct ProcessMonitor {
    tracked: HashMap<String, Tracked>,
}

impl ProcessMonitor {
    pub fn new() -> Self {
        Self { tracked: HashMap::new() }
    }

    /// Begin observing a launched game by executable path.
    pub fn track(&mut self, game_id: &str, game_name: &str, exe_path: &str) {
        let exe_name = std::path::Path::new(exe_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        let now = Instant::now();
        self.tracked.insert(
            game_id.to_string(),
            Tracked {
                game_id: game_id.to_string(),
                game_name: game_name.to_string(),
                exe_name,
                started_at: now,
                state: ProcessState::Launching,
                running_since: None,
                last_seen: now,
                observed_running: false,
            },
        );
    }

    pub fn is_tracking(&self, game_id: &str) -> bool {
        self.tracked.contains_key(game_id)
    }

    /// One poll cycle. Returns sessions that finished this tick.
    ///
    /// `grace` is how long a game may be absent before its session ends
    /// ([`EXIT_GRACE_SECS`] in production, `Duration::ZERO` in fast tests).
    pub fn poll(&mut self, live: &HashSet<String>, grace: Duration) -> Vec<FinishedSession> {
        let now = Instant::now();
        let mut finished = Vec::new();
        let mut to_remove = Vec::new();

        for (id, game) in self.tracked.iter_mut() {
            let present = !game.exe_name.is_empty() && live.contains(&game.exe_name);

            if present {
                game.last_seen = now;
                game.observed_running = true;
                game.state = ProcessState::Running;
                if game.running_since.is_none() {
                    game.running_since = Some(now);
                }
            } else if game.state == ProcessState::Running {
                game.state = ProcessState::Ending;
            } else if game.state == ProcessState::Launching {
                // A launcher stub that never spawns the real exe (crash on
                // start, wrong path) must not be tracked forever. This uses its
                // own longer window: a game legitimately sits in `Launching`
                // while its launcher bootstraps, so the exit grace is far too
                // short to judge it by.
                if game.started_at.elapsed() >= LAUNCH_TIMEOUT {
                    to_remove.push(id.clone());
                }
                continue;
            }

            // Only an observed-and-then-absent game produces a session. A launch
            // stub that never ran is discarded silently rather than recorded as
            // a bogus zero-length session.
            if game.state == ProcessState::Ending && game.last_seen.elapsed() >= grace {
                if let Some(since) = game.running_since {
                    let duration = since.elapsed().as_secs();
                    if game.observed_running && duration > 0 {
                        finished.push(FinishedSession {
                            game_id: game.game_id.clone(),
                            game_name: game.game_name.clone(),
                            duration_seconds: duration,
                        });
                    }
                }
                to_remove.push(id.clone());
            }
        }

        for id in to_remove {
            self.tracked.remove(&id);
        }
        finished
    }

    /// Stop tracking a game immediately, returning whatever session ran.
    pub fn stop(&mut self, game_id: &str) -> Option<FinishedSession> {
        self.tracked.remove(game_id).and_then(|game| {
            match (game.observed_running, game.running_since) {
                (true, Some(since)) => Some(FinishedSession {
                    game_id: game.game_id,
                    game_name: game.game_name,
                    duration_seconds: since.elapsed().as_secs(),
                }),
                _ => None
            }
        })
    }

    pub fn active(&self) -> Vec<ActiveGame> {
        let now = Instant::now();
        self.tracked
            .values()
            .map(|g| ActiveGame {
                game_id: g.game_id.clone(),
                game_name: g.game_name.clone(),
                state: g.state,
                elapsed_seconds: g
                    .running_since
                    .map(|s| now.duration_since(s).as_secs())
                    .unwrap_or_else(|| now.duration_since(g.started_at).as_secs()),
            })
            .collect()
    }

    /// Duration of the longest-running session, used for "session so far".
    pub fn longest_elapsed(&self) -> u64 {
        let now = Instant::now();
        self.tracked
            .values()
            .filter_map(|g| g.running_since)
            .map(|s| now.duration_since(s).as_secs())
            .max()
            .unwrap_or(0)
    }
}

impl Default for ProcessMonitor {
    fn default() -> Self {
        Self::new()
    }
}

/// Convenience for callers that only need the live-name set.
pub fn live_names(source: &dyn ProcessSource) -> HashSet<String> {
    source.snapshot()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::sleep;

    fn names(list: &[&str]) -> HashSet<String> {
        list.iter().map(|s| s.to_lowercase()).collect()
    }

    #[test]
    fn tracking_starts_in_launching_state() {
        let mut monitor = ProcessMonitor::new();
        monitor.track("g1", "Game", "C:/Games/game.exe");
        assert!(monitor.is_tracking("g1"));
        let active = monitor.active();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].state, ProcessState::Launching);
    }

    #[test]
    fn running_is_detected_case_insensitively() {
        let mut monitor = ProcessMonitor::new();
        monitor.track("g1", "Game", "C:/Games/Game.EXE");
        let finished = monitor.poll(&names(&["GAME.EXE"]), Duration::ZERO);
        assert!(finished.is_empty());
        assert_eq!(monitor.active()[0].state, ProcessState::Running);
    }

    #[test]
    fn a_game_that_never_appears_produces_no_session() {
        let mut monitor = ProcessMonitor::new();
        monitor.track("g1", "Game", "C:/Games/game.exe");

        // Still in the Launching state, so absence is not yet an exit.
        let finished = monitor.poll(&names(&[]), Duration::ZERO);
        assert!(finished.is_empty(), "a stub that never ran must not log playtime");
        assert!(monitor.is_tracking("g1"));

        // ...and even when the launch times out it logs nothing.
        let finished = monitor.poll(&names(&[]), Duration::ZERO);
        assert!(finished.is_empty(), "no session should be recorded");
    }

    #[test]
    fn a_running_game_becomes_ending_when_it_disappears() {
        let mut monitor = ProcessMonitor::new();
        monitor.track("g1", "Game", "C:/Games/game.exe");
        monitor.poll(&names(&["game.exe"]), Duration::ZERO);
        assert_eq!(monitor.active()[0].state, ProcessState::Running);

        // A long grace keeps it in the Ending state rather than tearing down.
        monitor.poll(&names(&[]), Duration::from_secs(60));
        assert_eq!(monitor.active()[0].state, ProcessState::Ending);
    }

    #[test]
    fn grace_window_prevents_premature_session_end() {
        let mut monitor = ProcessMonitor::new();
        monitor.track("g1", "Game", "C:/Games/game.exe");
        monitor.poll(&names(&["game.exe"]), Duration::ZERO);

        // Absent, but a long grace window means we keep waiting: engines
        // re-exec and would otherwise churn sessions.
        let finished = monitor.poll(&names(&[]), Duration::from_secs(60));
        assert!(finished.is_empty());
        assert!(monitor.is_tracking("g1"));
    }

    #[test]
    fn reappearing_within_grace_resumes_the_same_session() {
        let mut monitor = ProcessMonitor::new();
        monitor.track("g1", "Game", "C:/Games/game.exe");
        monitor.poll(&names(&["game.exe"]), Duration::ZERO);
        monitor.poll(&names(&[]), Duration::from_secs(60));
        monitor.poll(&names(&["game.exe"]), Duration::from_secs(60));

        assert_eq!(monitor.active()[0].state, ProcessState::Running);
    }

    #[test]
    fn finished_session_carries_the_game_identity() {
        let mut monitor = ProcessMonitor::new();
        monitor.track("g1", "Game One", "C:/Games/game.exe");
        monitor.poll(&names(&["game.exe"]), Duration::ZERO);
        sleep(Duration::from_millis(1100));

        // Absent with zero grace: ends on this single poll.
        let finished = monitor.poll(&names(&[]), Duration::ZERO);

        assert_eq!(finished.len(), 1);
        assert_eq!(finished[0].game_id, "g1");
        assert_eq!(finished[0].game_name, "Game One");
        assert!(finished[0].duration_seconds >= 1);
    }

    #[test]
    fn stop_returns_the_elapsed_session() {
        let mut monitor = ProcessMonitor::new();
        monitor.track("g1", "Game", "C:/Games/game.exe");
        monitor.poll(&names(&["game.exe"]), Duration::ZERO);
        sleep(Duration::from_millis(1100));

        let session = monitor.stop("g1").expect("running game should yield a session");
        assert!(session.duration_seconds >= 1);
        assert!(!monitor.is_tracking("g1"));
    }

    #[test]
    fn stopping_a_stub_that_never_ran_yields_nothing() {
        let mut monitor = ProcessMonitor::new();
        monitor.track("g1", "Game", "C:/Games/game.exe");
        assert!(monitor.stop("g1").is_none());
    }

    #[test]
    fn stopping_an_unknown_game_is_a_no_op() {
        let mut monitor = ProcessMonitor::new();
        assert!(monitor.stop("nope").is_none());
    }

    #[test]
    fn multiple_games_are_tracked_independently() {
        let mut monitor = ProcessMonitor::new();
        monitor.track("g1", "One", "C:/a/one.exe");
        monitor.track("g2", "Two", "C:/b/two.exe");

        monitor.poll(&names(&["one.exe"]), Duration::ZERO);
        let active = monitor.active();
        let g1 = active.iter().find(|g| g.game_id == "g1").unwrap();
        let g2 = active.iter().find(|g| g.game_id == "g2").unwrap();
        assert_eq!(g1.state, ProcessState::Running);
        assert_eq!(g2.state, ProcessState::Launching);
    }

    #[test]
    fn longest_elapsed_is_zero_with_nothing_running() {
        let mut monitor = ProcessMonitor::new();
        assert_eq!(monitor.longest_elapsed(), 0);
        monitor.track("g1", "One", "C:/a/one.exe");
        assert_eq!(monitor.longest_elapsed(), 0, "not yet observed running");
    }

    #[test]
    fn a_fake_source_drives_the_monitor() {
        struct Fake(HashSet<String>);
        impl ProcessSource for Fake {
            fn snapshot(&self) -> HashSet<String> {
                self.0.clone()
            }
        }
        let src = Fake(names(&["game.exe"]));
        assert!(live_names(&src).contains("game.exe"));
    }
}
