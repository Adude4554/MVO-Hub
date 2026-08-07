use super::*;
use std::env;
use std::fs;

pub struct BattleNetScanner;

impl BattleNetScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for BattleNetScanner {
    fn platform(&self) -> &str {
        "Battle.net"
    }

    fn is_available(&self) -> bool {
        let bn_paths = vec![
            env::var("PROGRAMFILES")
                .ok()
                .map(|p| PathBuf::from(p).join("Battle.net")),
            env::var("PROGRAMFILES(X86)")
                .ok()
                .map(|p| PathBuf::from(p).join("Battle.net")),
            Some(PathBuf::from("C:\\Program Files (x86)\\Battle.net")),
        ];

        bn_paths.iter().any(|d| {
            if let Some(dir) = d {
                dir.exists()
            } else {
                false
            }
        })
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        // Battle.net stores game info in ProgramData
        let program_data = env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        let agent_dir = PathBuf::from(&program_data).join("Battle.net").join("Agent").join("GameDB");

        if agent_dir.exists() {
            if let Ok(entries) = fs::read_dir(&agent_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("json") {
                        if let Ok(content) = fs::read_to_string(&path) {
                            if let Ok(game_data) = serde_json::from_str::<serde_json::Value>(&content) {
                                let name = game_data
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let install_path = game_data
                                    .get("install_path")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();

                                if !name.is_empty() && !install_path.is_empty() {
                                    let path = PathBuf::from(&install_path);
                                    games.push(ScannedGame {
                                        id: format!("bnet-{}", name.to_lowercase().replace(' ', "-")),
                                        name,
                                        platform: "Battle.net".to_string(),
                                        launcher: "Battle.net".to_string(),
                                        install_path,
                                        exe_path: None,
                                        app_id: None,
                                        version: None,
                                        icon_path: None,
                                        cover_path: None,
                                        banner_path: None,
                                        install_size: if path.exists() {
                                            Some(calculate_folder_size(&path))
                                        } else {
                                            None
                                        },
                                        scan_confidence: 0.9,
                                        is_installed: path.exists(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // Also scan common Battle.net game directories
        let bn_dirs = vec![
            PathBuf::from("C:\\Program Files (x86)\\World of Warcraft"),
            PathBuf::from("C:\\Program Files (x86)\\Overwatch"),
            PathBuf::from("C:\\Program Files (x86)\\Diablo III"),
            PathBuf::from("C:\\Program Files (x86)\\StarCraft II"),
            PathBuf::from("C:\\Program Files (x86)\\Hearthstone"),
            PathBuf::from("C:\\Program Files (x86)\\Call of Duty"),
        ];

        for dir in bn_dirs {
            if !dir.exists() {
                continue;
            }
            if let Some(exe) = find_exe_in_dir_deep(&dir, 2) {
                let name = dir.file_name().and_then(|e| e.to_str()).unwrap_or("Unknown").to_string();
                games.push(ScannedGame {
                    id: format!("bnet-{}", name.to_lowercase().replace(' ', "-")),
                    name,
                    platform: "Battle.net".to_string(),
                    launcher: "Battle.net".to_string(),
                    install_path: dir.to_string_lossy().to_string(),
                    exe_path: Some(exe.to_string_lossy().to_string()),
                    app_id: None,
                    version: None,
                    icon_path: None,
                    cover_path: None,
                    banner_path: None,
                    install_size: Some(calculate_folder_size(&dir)),
                    scan_confidence: 0.85,
                    is_installed: true,
                });
            }
        }

        games
    }

    fn priority(&self) -> u32 {
        70
    }
}
