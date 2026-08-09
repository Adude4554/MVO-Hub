use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCandidate {
    pub id: String,
    pub title: String,
    pub install_path: String,
    pub executable: Option<String>,
    pub launcher: String,
    pub launcher_game_id: Option<String>,
    pub source: String,
    pub confidence: f32,
    pub confidence_reasons: Vec<String>,
    pub metadata: Option<CandidateMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateMetadata {
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub description: Option<String>,
    pub genres: Vec<String>,
    pub platform: String,
}

impl GameCandidate {
    pub fn new(title: &str, install_path: &str, launcher: &str, source: &str) -> Self {
        Self {
            id: String::new(),
            title: title.to_string(),
            install_path: install_path.to_string(),
            executable: None,
            launcher: launcher.to_string(),
            launcher_game_id: None,
            source: source.to_string(),
            confidence: 0.0,
            confidence_reasons: Vec::new(),
            metadata: None,
        }
    }

    pub fn with_executable(mut self, exe: &str) -> Self {
        self.executable = Some(exe.to_string());
        self
    }

    pub fn with_confidence(mut self, score: f32, reasons: Vec<String>) -> Self {
        self.confidence = score;
        self.confidence_reasons = reasons;
        self
    }

    pub fn with_app_id(mut self, id: &str) -> Self {
        self.launcher_game_id = Some(id.to_string());
        self
    }

    pub fn generate_id(&mut self) {
        if self.id.is_empty() {
            let launcher = self.launcher.to_lowercase().replace(' ', "-");
            let path = self.install_path.to_lowercase().replace('\\', "/").replace(' ', "-");
            self.id = format!("{}:{}", launcher, path);
        }
    }
}

impl From<crate::scanner::ScannedGame> for GameCandidate {
    fn from(game: crate::scanner::ScannedGame) -> Self {
        let mut candidate = GameCandidate::new(
            &game.name,
            &game.install_path,
            &game.launcher,
            &game.platform,
        );
        candidate.id = game.id;
        candidate.executable = game.exe_path;
        candidate.launcher_game_id = game.app_id;
        candidate.confidence = game.scan_confidence;
        candidate
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_candidate() {
        let c = GameCandidate::new("Test Game", "C:\\Games\\Test", "Steam", "Launcher");
        assert_eq!(c.title, "Test Game");
        assert_eq!(c.confidence, 0.0);
    }

    #[test]
    fn test_candidate_builder() {
        let c = GameCandidate::new("Test", "C:\\Test", "Steam", "Launcher")
            .with_executable("test.exe")
            .with_confidence(0.8, vec!["Test reason".to_string()])
            .with_app_id("12345");
        assert_eq!(c.executable, Some("test.exe".to_string()));
        assert_eq!(c.confidence, 0.8);
        assert_eq!(c.launcher_game_id, Some("12345".to_string()));
    }

    #[test]
    fn test_generate_id() {
        let mut c = GameCandidate::new("Test Game", "C:\\Games\\Test Game", "Steam", "Launcher");
        c.generate_id();
        assert!(!c.id.is_empty());
        assert!(c.id.starts_with("steam:"));
    }
}
