use super::*;
use std::env;
use std::fs;

pub struct LutrisScanner;

impl LutrisScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for LutrisScanner {
    fn platform(&self) -> &str {
        "Lutris"
    }

    fn is_available(&self) -> bool {
        if let Ok(appdata) = env::var("APPDATA") {
            let lutris_dir = PathBuf::from(appdata).join("Lutris").join("games");
            return lutris_dir.exists();
        }
        false
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        let games_dirs = vec![
            env::var("APPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Lutris").join("games")),
        ];

        for dir_opt in games_dirs {
            if let Some(dir) = dir_opt {
                if !dir.exists() {
                    continue;
                }
                if let Ok(entries) = fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        let name = path
                            .file_stem()
                            .and_then(|n| n.to_str())
                            .unwrap_or("")
                            .to_string();

                        if path.is_file()
                            && path.extension().and_then(|e| e.to_str()) == Some("json")
                            && !name.is_empty()
                        {
                            if let Ok(content) = fs::read_to_string(&path) {
                                if let Ok(config) =
                                    serde_json::from_str::<serde_json::Value>(&content)
                                {
                                    let game_name = config
                                        .get("name")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or(&name)
                                        .to_string();

                                    let game_slug = config
                                        .get("slug")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();

                                    let install_path = config
                                        .get("game_path")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();

                                    let is_installed = if !install_path.is_empty() {
                                        PathBuf::from(&install_path).exists()
                                    } else {
                                        false
                                    };

                                    let slug_or_name = if game_slug.is_empty() {
                                        name.clone()
                                    } else {
                                        game_slug.clone()
                                    };

                                    games.push(ScannedGame {
                                        id: format!(
                                            "lutris-{}",
                                            slug_or_name.to_lowercase().replace(' ', "-")
                                        ),
                                        name: game_name,
                                        platform: "Lutris".to_string(),
                                        launcher: "Lutris".to_string(),
                                        install_path,
                                        exe_path: None,
                                        app_id: if game_slug.is_empty() {
                                            None
                                        } else {
                                            Some(game_slug)
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

        games
    }

    fn priority(&self) -> u32 {
        75
    }
}
