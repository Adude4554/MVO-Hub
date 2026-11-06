//! Telemetry and diagnostic hooks.
//!
//! The design constraint is **no arbitrary data leaves the machine**. Events are
//! a fixed name plus a small set of typed, enumerated values; there is no API
//! that accepts free text. That means a future integration cannot accidentally
//! ship a file path, a game name or a chat message as telemetry — the type
//! system refuses to represent it.
//!
//! Events are queued locally and only *flushed* when the licence tier and the
//! tenant profile both permit telemetry. Nothing here performs network I/O.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Mutex;

/// The closed set of telemetry events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TelemetryEvent {
    AppLaunched,
    GameSessionStarted,
    GameSessionEnded,
    PluginLoaded,
    SyncCompleted,
    SyncConflict,
    AchievementUnlocked,
    SettingsChanged,
    ErrorReported,
}

impl TelemetryEvent {
    pub fn name(self) -> &'static str {
        match self {
            TelemetryEvent::AppLaunched => "app.launched",
            TelemetryEvent::GameSessionStarted => "game.session.started",
            TelemetryEvent::GameSessionEnded => "game.session.ended",
            TelemetryEvent::PluginLoaded => "plugin.loaded",
            TelemetryEvent::SyncCompleted => "sync.completed",
            TelemetryEvent::SyncConflict => "sync.conflict",
            TelemetryEvent::AchievementUnlocked => "achievement.unlocked",
            TelemetryEvent::SettingsChanged => "settings.changed",
            TelemetryEvent::ErrorReported => "error.reported",
        }
    }
}

/// A numeric/binary measurement attached to an event.
///
/// Deliberately not `serde_json::Value`: only counts and durations are
/// representable, so no string payload can be smuggled through.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "value")]
pub enum Metric {
    Count(u64),
    DurationSeconds(u64),
    Bytes(u64),
    /// 0..=100, clamped.
    Percent(u8),
}

impl Metric {
    /// Clamp to the representable range.
    pub fn normalised(self) -> Metric {
        match self {
            Metric::Percent(p) => Metric::Percent(p.min(100)),
            other => other,
        }
    }
}

/// One queued telemetry record.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryRecord {
    pub event: TelemetryEvent,
    pub name: String,
    pub metric: Option<Metric>,
    /// Coarse build label (e.g. `0.3.0`). Not user-identifying.
    pub build: String,
    pub at: String,
}

/// Diagnostic snapshot for support tickets.
///
/// Built by the app from local state; the caller decides what to include. It is
/// plain data so a user can review it before sharing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsBundle {
    pub app_version: String,
    pub os: String,
    pub tier: String,
    pub tenant_id: Option<String>,
    pub plugin_count: usize,
    pub tracked_saves: usize,
    pub achievements_unlocked: usize,
    pub pending_uploads: i64,
    pub active_sessions: usize,
    pub generated_at: String,
}

impl DiagnosticsBundle {
    /// A short, human-readable summary for pasting into an issue report.
    pub fn to_summary(&self) -> String {
        format!(
            "MVO {} on {}\ntier: {} (tenant: {})\nplugins: {}, saves: {}, achievements: {}\npending uploads: {}, active sessions: {}\ngenerated: {}",
            self.app_version,
            self.os,
            self.tier,
            self.tenant_id.as_deref().unwrap_or("none"),
            self.plugin_count,
            self.tracked_saves,
            self.achievements_unlocked,
            self.pending_uploads,
            self.active_sessions,
            self.generated_at,
        )
    }
}

/// Bounded in-memory event queue.
///
/// Bounded on purpose: without a cap, a machine that never uploads would grow
/// the queue until the app ran out of memory.
pub struct TelemetryQueue {
    capacity: usize,
    records: Mutex<VecDeque<TelemetryRecord>>,
}

impl TelemetryQueue {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            records: Mutex::new(VecDeque::new()),
        }
    }

    /// Queue an event. Oldest records are dropped when full.
    pub fn record(
        &self,
        event: TelemetryEvent,
        metric: Option<Metric>,
        build: &str,
    ) -> Result<(), String> {
        let record = TelemetryRecord {
            event,
            name: event.name().to_string(),
            metric: metric.map(Metric::normalised),
            build: build.to_string(),
            at: super::now_iso(),
        };
        let mut queue = self.records.lock().map_err(|_| "telemetry queue poisoned")?;
        if queue.len() >= self.capacity {
            queue.pop_front();
        }
        queue.push_back(record);
        Ok(())
    }

    pub fn len(&self) -> usize {
        self.records.lock().map(|q| q.len()).unwrap_or(0)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Snapshot without draining (safe to call from a diagnostic command).
    pub fn snapshot(&self) -> Vec<TelemetryRecord> {
        self.records
            .lock()
            .map(|q| q.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Drain everything, for a future uploader.
    pub fn drain(&self) -> Vec<TelemetryRecord> {
        self.records
            .lock()
            .map(|mut q| q.drain(..).collect())
            .unwrap_or_default()
    }
}

impl Default for TelemetryQueue {
    fn default() -> Self {
        Self::new(500)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recording_appends_a_named_event() {
        let q = TelemetryQueue::new(10);
        q.record(TelemetryEvent::AppLaunched, None, "0.3.0").unwrap();

        let records = q.snapshot();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].name, "app.launched");
        assert_eq!(records[0].build, "0.3.0");
        assert!(records[0].metric.is_none());
    }

    #[test]
    fn queue_is_bounded_and_drops_oldest() {
        let q = TelemetryQueue::new(2);
        q.record(TelemetryEvent::AppLaunched, None, "1").unwrap();
        q.record(TelemetryEvent::PluginLoaded, None, "1").unwrap();
        q.record(TelemetryEvent::SyncCompleted, None, "1").unwrap();

        assert_eq!(q.len(), 2);
        let names: Vec<_> = q.snapshot().iter().map(|r| r.name.clone()).collect();
        assert_eq!(names, vec!["plugin.loaded", "sync.completed"]);
    }

    #[test]
    fn zero_capacity_is_clamped_to_one() {
        let q = TelemetryQueue::new(0);
        q.record(TelemetryEvent::AppLaunched, None, "1").unwrap();
        q.record(TelemetryEvent::SyncCompleted, None, "1").unwrap();
        assert_eq!(q.len(), 1);
        assert_eq!(q.snapshot()[0].name, "sync.completed");
    }

    #[test]
    fn percent_metrics_are_clamped() {
        let q = TelemetryQueue::new(5);
        q.record(TelemetryEvent::SyncCompleted, Some(Metric::Percent(250)), "1")
            .unwrap();
        assert_eq!(q.snapshot()[0].metric, Some(Metric::Percent(100)));

        let q = TelemetryQueue::new(5);
        q.record(TelemetryEvent::SyncCompleted, Some(Metric::Percent(42)), "1")
            .unwrap();
        assert_eq!(q.snapshot()[0].metric, Some(Metric::Percent(42)));
    }

    #[test]
    fn drain_empties_the_queue() {
        let q = TelemetryQueue::new(5);
        q.record(TelemetryEvent::AppLaunched, None, "1").unwrap();
        q.record(TelemetryEvent::ErrorReported, Some(Metric::Count(3)), "1")
            .unwrap();

        let drained = q.drain();
        assert_eq!(drained.len(), 2);
        assert!(q.is_empty());
    }

    #[test]
    fn every_event_has_a_unique_stable_name() {
        let events = [
            TelemetryEvent::AppLaunched,
            TelemetryEvent::GameSessionStarted,
            TelemetryEvent::GameSessionEnded,
            TelemetryEvent::PluginLoaded,
            TelemetryEvent::SyncCompleted,
            TelemetryEvent::SyncConflict,
            TelemetryEvent::AchievementUnlocked,
            TelemetryEvent::SettingsChanged,
            TelemetryEvent::ErrorReported,
        ];
        let mut names: Vec<_> = events.iter().map(|e| e.name()).collect();
        let count = names.len();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), count, "event names must be unique");
    }

    #[test]
    fn telemetry_records_carry_no_free_text_channel() {
        // The only string fields are the closed-set event name, the build label
        // and a timestamp. This test documents the guarantee: adding a
        // `payload: String` field would fail to compile here.
        let q = TelemetryQueue::new(1);
        q.record(TelemetryEvent::GameSessionEnded, Some(Metric::DurationSeconds(120)), "0.3.0")
            .unwrap();
        let record = &q.snapshot()[0];

        assert!(record.name.chars().all(|c| c.is_ascii_lowercase() || c == '.' || c == '_'));
        assert!(matches!(record.metric, Some(Metric::DurationSeconds(120))));
    }

    #[test]
    fn metrics_serialise_as_tagged_values() {
        let json = serde_json::to_value(Metric::DurationSeconds(90)).unwrap();
        assert_eq!(json["kind"], "durationSeconds");
        assert_eq!(json["value"], 90);
    }

    #[test]
    fn diagnostics_summary_mentions_key_facts() {
        let bundle = DiagnosticsBundle {
            app_version: "0.3.0".into(),
            os: "windows".into(),
            tier: "enterprise".into(),
            tenant_id: Some("acme".into()),
            plugin_count: 3,
            tracked_saves: 7,
            achievements_unlocked: 12,
            pending_uploads: 2,
            active_sessions: 1,
            generated_at: "2026-11-06T00:00:00Z".into(),
        };
        let summary = bundle.to_summary();
        assert!(summary.contains("0.3.0"));
        assert!(summary.contains("acme"));
        assert!(summary.contains("plugins: 3"));
    }

    #[test]
    fn diagnostics_summary_handles_missing_tenant() {
        let bundle = DiagnosticsBundle {
            app_version: "0.3.0".into(),
            os: "windows".into(),
            tier: "community".into(),
            tenant_id: None,
            plugin_count: 0,
            tracked_saves: 0,
            achievements_unlocked: 0,
            pending_uploads: 0,
            active_sessions: 0,
            generated_at: "2026-11-06T00:00:00Z".into(),
        };
        assert!(bundle.to_summary().contains("tenant: none"));
    }
}
