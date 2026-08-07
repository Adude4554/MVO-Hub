use super::*;
use std::env;

pub struct RiotScanner;

impl RiotScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for RiotScanner {
    fn platform(&self) -> &str {
        "Riot"
    }

    fn is_available(&self) -> bool {
        let riot_paths = vec![
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Riot Games")),
            Some(PathBuf::from("C:\\Riot Games")),
        ];

        riot_paths.iter().any(|d| {
            if let Some(dir) = d {
                dir.exists()
            } else {
                false
            }
        })
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        let riot_dirs = vec![
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Riot Games")),
            Some(PathBuf::from("C:\\Riot Games")),
        ];

        // Known Riot games
        let known_games = vec![
            ("VALORANT", "valorant"),
            ("League of Legends", "leagueoflegends"),
            ("Teamfight Tactics", "teamfighttactics"),
        ];

        for dir_opt in riot_dirs {
            if let Some(dir) = dir_opt {
                if !dir.exists() {
                    continue;
                }
                for (game_name, game_id) in &known_games {
                    let game_dir = dir.join(game_id);
                    if game_dir.exists() {
                        if let Some(exe) = find_exe_in_dir_deep(&game_dir, 3) {
                            games.push(ScannedGame {
                                id: format!("riot-{}", game_id),
                                name: game_name.to_string(),
                                platform: "Riot".to_string(),
                                launcher: "Riot Client".to_string(),
                                install_path: game_dir.to_string_lossy().to_string(),
                                exe_path: Some(exe.to_string_lossy().to_string()),
                                app_id: Some(game_id.to_string()),
                                version: None,
                                icon_path: None,
                                cover_path: None,
                                banner_path: None,
                                install_size: Some(calculate_folder_size(&game_dir)),
                                scan_confidence: 0.95,
                                is_installed: true,
                            });
                        }
                    }
                }
            }
        }

        games
    }

    fn priority(&self) -> u32 {
        65
    }
}
