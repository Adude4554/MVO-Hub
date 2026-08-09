use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use sysinfo::System;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSession {
    pub game_id: String,
    pub game_name: String,
    pub exe_path: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub duration_seconds: u64,
    pub is_running: bool,
}

struct TrackedGame {
    game_id: String,
    game_name: String,
    exe_path: String,
    exe_name: String,
    started_at: Instant,
    last_seen: Instant,
}

pub struct LaunchTracker {
    tracked: Arc<Mutex<HashMap<String, TrackedGame>>>,
    sessions: Arc<Mutex<Vec<GameSession>>>,
}

impl LaunchTracker {
    pub fn new() -> Self {
        Self {
            tracked: Arc::new(Mutex::new(HashMap::new())),
            sessions: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn track_launch(&self, game_id: &str, game_name: &str, exe_path: &str) {
        let exe_name = std::path::Path::new(exe_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let tracked = TrackedGame {
            game_id: game_id.to_string(),
            game_name: game_name.to_string(),
            exe_path: exe_path.to_string(),
            exe_name,
            started_at: Instant::now(),
            last_seen: Instant::now(),
        };

        if let Ok(mut map) = self.tracked.lock() {
            map.insert(game_id.to_string(), tracked);
        }
    }

    pub fn check_processes(&self) -> Vec<String> {
        let mut sys = System::new_all();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        let mut still_running = Vec::new();

        if let Ok(mut map) = self.tracked.lock() {
            let mut to_remove = Vec::new();

            for (game_id, tracked) in map.iter_mut() {
                let found = sys.processes().values().any(|proc| {
                    let proc_name = proc.name().to_string_lossy().to_lowercase();
                    proc_name == tracked.exe_name.to_lowercase()
                });

                if found {
                    tracked.last_seen = Instant::now();
                    still_running.push(game_id.clone());
                } else {
                    if tracked.last_seen.elapsed() > Duration::from_secs(5) {
                        to_remove.push(game_id.clone());
                    }
                }
            }

            for game_id in to_remove {
                if let Some(tracked) = map.remove(&game_id) {
                    let duration = tracked.started_at.elapsed().as_secs();
                    let session = GameSession {
                        game_id: tracked.game_id,
                        game_name: tracked.game_name,
                        exe_path: tracked.exe_path,
                        started_at: unix_now() - duration,
                        ended_at: Some(unix_now()),
                        duration_seconds: duration,
                        is_running: false,
                    };
                    if let Ok(mut sessions) = self.sessions.lock() {
                        sessions.push(session);
                    }
                }
            }
        }

        still_running
    }

    pub fn get_active_sessions(&self) -> Vec<GameSession> {
        let mut sessions = Vec::new();
        if let Ok(map) = self.tracked.lock() {
            for tracked in map.values() {
                sessions.push(GameSession {
                    game_id: tracked.game_id.clone(),
                    game_name: tracked.game_name.clone(),
                    exe_path: tracked.exe_path.clone(),
                    started_at: unix_now() - tracked.started_at.elapsed().as_secs(),
                    ended_at: None,
                    duration_seconds: tracked.started_at.elapsed().as_secs(),
                    is_running: true,
                });
            }
        }
        sessions
    }

    pub fn get_recent_sessions(&self, limit: usize) -> Vec<GameSession> {
        if let Ok(sessions) = self.sessions.lock() {
            sessions.iter().rev().take(limit).cloned().collect()
        } else {
            Vec::new()
        }
    }

    pub fn stop_tracking(&self, game_id: &str) {
        if let Ok(mut map) = self.tracked.lock() {
            if let Some(tracked) = map.remove(game_id) {
                let duration = tracked.started_at.elapsed().as_secs();
                let session = GameSession {
                    game_id: tracked.game_id,
                    game_name: tracked.game_name,
                    exe_path: tracked.exe_path,
                    started_at: unix_now() - duration,
                    ended_at: Some(unix_now()),
                    duration_seconds: duration,
                    is_running: false,
                };
                if let Ok(mut sessions) = self.sessions.lock() {
                    sessions.push(session);
                }
            }
        }
    }

    pub fn is_tracking(&self, game_id: &str) -> bool {
        self.tracked.lock().map(|m| m.contains_key(game_id)).unwrap_or(false)
    }
}

impl Default for LaunchTracker {
    fn default() -> Self {
        Self::new()
    }
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn launch_tracker() -> &'static LaunchTracker {
    static TRACKER: OnceLock<LaunchTracker> = OnceLock::new();
    TRACKER.get_or_init(LaunchTracker::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tracker_new() {
        let tracker = LaunchTracker::new();
        assert!(!tracker.is_tracking("test"));
    }

    #[test]
    fn test_track_and_check() {
        let tracker = LaunchTracker::new();
        tracker.track_launch("test-1", "Test Game", "C:\\test.exe");
        assert!(tracker.is_tracking("test-1"));
        let active = tracker.get_active_sessions();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].game_name, "Test Game");
    }

    #[test]
    fn test_stop_tracking() {
        let tracker = LaunchTracker::new();
        tracker.track_launch("test-1", "Test Game", "C:\\test.exe");
        tracker.stop_tracking("test-1");
        assert!(!tracker.is_tracking("test-1"));
        let recent = tracker.get_recent_sessions(10);
        assert_eq!(recent.len(), 1);
        assert!(recent[0].ended_at.is_some());
    }
}
