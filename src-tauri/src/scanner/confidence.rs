use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ConfidenceReason {
    LauncherRegistration,
    KnownGameId,
    MetadataMatch,
    ExecutableMetadata,
    ShortcutTarget,
    GameDirectorySignature,
    LargeAssetStructure,
    KnownPublisher,
    KnownExecutable,
    EngineDirectory,
    ConfigFileFound,
    SteamAppId,
    GogInfoFile,
    EpicManifest,
    RomDirectory,
    ManualEntry,
    UserOverride,
}

impl ConfidenceReason {
    pub fn label(&self) -> &str {
        match self {
            Self::LauncherRegistration => "Launcher registration detected",
            Self::KnownGameId => "Known game ID found",
            Self::MetadataMatch => "Metadata API match",
            Self::ExecutableMetadata => "Executable metadata indicates game",
            Self::ShortcutTarget => "Shortcut points to game executable",
            Self::GameDirectorySignature => "Game-like directory structure",
            Self::LargeAssetStructure => "Large asset files present",
            Self::KnownPublisher => "Known game publisher",
            Self::KnownExecutable => "Known game executable",
            Self::EngineDirectory => "Game engine directory detected",
            Self::ConfigFileFound => "Game configuration files found",
            Self::SteamAppId => "Steam App ID found",
            Self::GogInfoFile => "GOG info file found",
            Self::EpicManifest => "Epic Games manifest found",
            Self::RomDirectory => "ROM directory detected",
            Self::ManualEntry => "Manually added by user",
            Self::UserOverride => "User override (always trusted)",
        }
    }

    pub fn point_value(&self) -> i32 {
        match self {
            Self::UserOverride => 100,
            Self::ManualEntry => 95,
            Self::LauncherRegistration => 40,
            Self::KnownGameId => 30,
            Self::SteamAppId => 30,
            Self::GogInfoFile => 30,
            Self::EpicManifest => 30,
            Self::MetadataMatch => 25,
            Self::KnownExecutable => 20,
            Self::KnownPublisher => 15,
            Self::ExecutableMetadata => 10,
            Self::ShortcutTarget => 10,
            Self::GameDirectorySignature => 8,
            Self::EngineDirectory => 5,
            Self::ConfigFileFound => 3,
            Self::LargeAssetStructure => 2,
            Self::RomDirectory => 5,
        }
    }
}

impl fmt::Display for ConfidenceReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.label())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfidenceScore {
    pub score: f32,
    pub reasons: Vec<ConfidenceReason>,
}

impl ConfidenceScore {
    pub fn new() -> Self {
        Self { score: 0.0, reasons: Vec::new() }
    }

    pub fn add(&mut self, reason: ConfidenceReason) {
        self.score = (self.score + reason.point_value() as f32).min(100.0);
        self.reasons.push(reason);
    }

    pub fn add_weighted(&mut self, reason: ConfidenceReason, weight: f32) {
        self.score = (self.score + reason.point_value() as f32 * weight).min(100.0);
        self.reasons.push(reason);
    }

    pub fn raw_add(&mut self, points: f32, reason: ConfidenceReason) {
        self.score = (self.score + points).min(100.0);
        self.reasons.push(reason);
    }

    pub fn level(&self) -> ConfidenceLevel {
        match self.score as u32 {
            0..=29 => ConfidenceLevel::Ignore,
            30..=49 => ConfidenceLevel::Weak,
            50..=69 => ConfidenceLevel::Possible,
            70..=89 => ConfidenceLevel::Likely,
            _ => ConfidenceLevel::Confirmed,
        }
    }

    pub fn should_show(&self) -> bool {
        self.score >= 30.0
    }

    pub fn needs_review(&self) -> bool {
        self.score >= 30.0 && self.score < 70.0
    }

    pub fn reasons_summary(&self) -> String {
        self.reasons.iter().map(|r| format!("+ {}", r.label())).collect::<Vec<_>>().join("\n")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConfidenceLevel {
    Ignore,
    Weak,
    Possible,
    Likely,
    Confirmed,
}

impl ConfidenceLevel {
    pub fn label(&self) -> &str {
        match self {
            Self::Ignore => "Ignore",
            Self::Weak => "Weak",
            Self::Possible => "Possible Game",
            Self::Likely => "Likely Game",
            Self::Confirmed => "Confirmed",
        }
    }

    pub fn color_class(&self) -> &str {
        match self {
            Self::Ignore => "text-gray-500",
            Self::Weak => "text-yellow-500",
            Self::Possible => "text-orange-400",
            Self::Likely => "text-green-400",
            Self::Confirmed => "text-green-300",
        }
    }
}

impl fmt::Display for ConfidenceLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.label())
    }
}

impl Default for ConfidenceScore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_confidence_empty() {
        let c = ConfidenceScore::new();
        assert_eq!(c.score, 0.0);
        assert!(c.reasons.is_empty());
        assert_eq!(c.level(), ConfidenceLevel::Ignore);
        assert!(!c.should_show());
    }

    #[test]
    fn test_confidence_launcher() {
        let mut c = ConfidenceScore::new();
        c.add(ConfidenceReason::LauncherRegistration);
        assert_eq!(c.score, 40.0);
        assert_eq!(c.level(), ConfidenceLevel::Weak);
        assert!(c.should_show());
    }

    #[test]
    fn test_confidence_high() {
        let mut c = ConfidenceScore::new();
        c.add(ConfidenceReason::LauncherRegistration);
        c.add(ConfidenceReason::KnownGameId);
        c.add(ConfidenceReason::ExecutableMetadata);
        assert!(c.score >= 70.0);
        assert_eq!(c.level(), ConfidenceLevel::Likely);
    }

    #[test]
    fn test_confidence_capped_at_100() {
        let mut c = ConfidenceScore::new();
        c.add(ConfidenceReason::UserOverride);
        assert_eq!(c.score, 100.0);
        c.add(ConfidenceReason::LauncherRegistration);
        assert_eq!(c.score, 100.0);
    }

    #[test]
    fn test_needs_review() {
        let mut c = ConfidenceScore::new();
        c.raw_add(50.0, ConfidenceReason::GameDirectorySignature);
        assert!(c.needs_review());
        c.raw_add(30.0, ConfidenceReason::KnownExecutable);
        assert!(!c.needs_review());
    }

    #[test]
    fn test_reasons_summary() {
        let mut c = ConfidenceScore::new();
        c.add(ConfidenceReason::SteamAppId);
        c.add(ConfidenceReason::ExecutableMetadata);
        let summary = c.reasons_summary();
        assert!(summary.contains("Steam App ID"));
        assert!(summary.contains("Executable metadata"));
    }

    #[test]
    fn test_level_thresholds() {
        let cases = vec![
            (0.0, ConfidenceLevel::Ignore),
            (29.0, ConfidenceLevel::Ignore),
            (30.0, ConfidenceLevel::Weak),
            (49.0, ConfidenceLevel::Weak),
            (50.0, ConfidenceLevel::Possible),
            (69.0, ConfidenceLevel::Possible),
            (70.0, ConfidenceLevel::Likely),
            (89.0, ConfidenceLevel::Likely),
            (90.0, ConfidenceLevel::Confirmed),
            (100.0, ConfidenceLevel::Confirmed),
        ];
        for (score, expected) in cases {
            let mut c = ConfidenceScore::new();
            c.raw_add(score, ConfidenceReason::GameDirectorySignature);
            assert_eq!(c.level(), expected, "Score {} should be {:?}", score, expected);
        }
    }

    #[test]
    fn test_all_reasons_combined() {
        let mut c = ConfidenceScore::new();
        c.add(ConfidenceReason::LauncherRegistration);
        c.add(ConfidenceReason::KnownGameId);
        c.add(ConfidenceReason::MetadataMatch);
        c.add(ConfidenceReason::ExecutableMetadata);
        c.add(ConfidenceReason::ShortcutTarget);
        c.add(ConfidenceReason::GameDirectorySignature);
        c.add(ConfidenceReason::LargeAssetStructure);
        c.add(ConfidenceReason::KnownPublisher);
        c.add(ConfidenceReason::KnownExecutable);
        c.add(ConfidenceReason::EngineDirectory);
        c.add(ConfidenceReason::ConfigFileFound);
        c.add(ConfidenceReason::SteamAppId);
        c.add(ConfidenceReason::GogInfoFile);
        c.add(ConfidenceReason::EpicManifest);
        c.add(ConfidenceReason::RomDirectory);
        assert_eq!(c.score, 100.0);
        assert_eq!(c.level(), ConfidenceLevel::Confirmed);
        assert_eq!(c.reasons.len(), 15);
    }

    #[test]
    fn test_empty_reasons_list() {
        let c = ConfidenceScore::new();
        assert!(c.reasons.is_empty());
        assert_eq!(c.score, 0.0);
        assert_eq!(c.reasons_summary(), "");
    }

    #[test]
    fn test_boundary_score_zero() {
        let mut c = ConfidenceScore::new();
        c.raw_add(0.0, ConfidenceReason::GameDirectorySignature);
        assert_eq!(c.score, 0.0);
        assert_eq!(c.level(), ConfidenceLevel::Ignore);
        assert!(!c.should_show());
    }

    #[test]
    fn test_boundary_score_half() {
        let mut c = ConfidenceScore::new();
        c.raw_add(0.5, ConfidenceReason::GameDirectorySignature);
        assert_eq!(c.score, 0.5);
        assert_eq!(c.level(), ConfidenceLevel::Ignore);
        assert!(!c.should_show());
    }

    #[test]
    fn test_boundary_score_one() {
        let mut c = ConfidenceScore::new();
        c.raw_add(1.0, ConfidenceReason::GameDirectorySignature);
        assert_eq!(c.score, 1.0);
        assert_eq!(c.level(), ConfidenceLevel::Ignore);
        assert!(!c.should_show());
    }
}
