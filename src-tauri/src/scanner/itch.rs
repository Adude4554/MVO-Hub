use super::*;
use std::env;
use std::fs;

pub struct ItchScanner;

impl ItchScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for ItchScanner {
    fn platform(&self) -> &str {
        "itch.io"
    }

    fn is_available(&self) -> bool {
        let itch_paths = vec![
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("itch")),
            Some(PathBuf::from("C:\\Users\\AppData\\Local\\itch")),
        ];

        itch_paths.iter().any(|d| {
            if let Some(dir) = d {
                dir.exists()
            } else {
                false
            }
        })
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        // itch.io stores games in its own directory structure
        let itch_base = env::var("LOCALAPPDATA")
            .ok()
            .map(|p| PathBuf::from(p).join("itch").join("games"));

        if let Some(itch_dir) = itch_base {
            if itch_dir.exists() {
                if let Ok(entries) = fs::read_dir(&itch_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_dir() {
                            // Each itch game is in its own directory
                            if let Some(exe) = find_exe_in_dir_deep(&path, 3) {
                                let name = path.file_name().and_then(|e| e.to_str()).unwrap_or("Unknown").to_string();
                                games.push(ScannedGame {
                                    id: format!("itch-{}", name.to_lowercase().replace(' ', "-")),
                                    name,
                                    platform: "itch.io".to_string(),
                                    launcher: "itch.io".to_string(),
                                    install_path: path.to_string_lossy().to_string(),
                                    exe_path: Some(exe.to_string_lossy().to_string()),
                                    app_id: None,
                                    version: None,
                                    icon_path: None,
                                    cover_path: None,
                                    banner_path: None,
                                    install_size: Some(calculate_folder_size(&path)),
                                    scan_confidence: 0.75,
                                    is_installed: true,
                                });
                            }
                        }
                    }
                }
            }
        }

        games
    }

    fn priority(&self) -> u32 {
        50
    }
}
