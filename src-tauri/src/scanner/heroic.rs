use super::*;
use std::env;
use std::fs;

pub struct HeroicScanner;

impl HeroicScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for HeroicScanner {
    fn platform(&self) -> &str {
        "Heroic"
    }

    fn is_available(&self) -> bool {
        if let Ok(appdata) = env::var("APPDATA") {
            let heroic_dir = PathBuf::from(appdata)
                .join("heroic")
                .join("GamesCache");
            return heroic_dir.exists();
        }
        false
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        let cache_dirs = vec![
            env::var("APPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("heroic").join("GamesCache")),
        ];

        for dir_opt in cache_dirs {
            if let Some(dir) = dir_opt {
                if !dir.exists() {
                    continue;
                }
                if let Ok(entries) = fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();

                        // Heroic stores JSON game cache files
                        if path.is_file()
                            && path.extension().and_then(|e| e.to_str()) == Some("json")
                        {
                            if let Ok(content) = fs::read_to_string(&path) {
                                if let Ok(config) =
                                    serde_json::from_str::<serde_json::Value>(&content)
                                {
                                    let game_name = config
                                        .get("app_name")
                                        .or_else(|| config.get("title"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();

                                    let install_path = config
                                        .get("install_path")
                                        .or_else(|| config.get("installDir"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();

                                    let app_id = config
                                        .get("app_name")
                                        .or_else(|| config.get("title"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();

                                    let is_installed = if !install_path.is_empty() {
                                        PathBuf::from(&install_path).exists()
                                    } else {
                                        false
                                    };

                                    if !game_name.is_empty() {
                                        games.push(ScannedGame {
                                            id: format!(
                                                "heroic-{}",
                                                game_name.to_lowercase().replace(' ', "-")
                                            ),
                                            name: game_name,
                                            platform: "Heroic".to_string(),
                                            launcher: "Heroic Games Launcher".to_string(),
                                            install_path,
                                            exe_path: None,
                                            app_id: if app_id.is_empty() {
                                                None
                                            } else {
                                                Some(app_id)
                                            },
                                            version: None,
                                            icon_path: None,
                                            cover_path: None,
                                            banner_path: None,
                                            install_size: None,
                                            scan_confidence: 0.85,
                                            is_installed,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        games
    }

    fn priority(&self) -> u32 {
        75
    }
}
