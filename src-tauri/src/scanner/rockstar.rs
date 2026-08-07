use super::*;
use std::env;
use std::fs;

pub struct RockstarScanner;

impl RockstarScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for RockstarScanner {
    fn platform(&self) -> &str {
        "Rockstar"
    }

    fn is_available(&self) -> bool {
        let rockstar_paths = vec![
            env::var("PROGRAMFILES")
                .ok()
                .map(|p| PathBuf::from(p).join("Rockstar Games")),
            Some(PathBuf::from("C:\\Program Files\\Rockstar Games")),
            Some(PathBuf::from("C:\\Program Files (x86)\\Rockstar Games")),
        ];

        rockstar_paths.iter().any(|d| {
            if let Some(dir) = d {
                dir.exists()
            } else {
                false
            }
        })
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        let rockstar_dirs = vec![
            env::var("PROGRAMFILES")
                .ok()
                .map(|p| PathBuf::from(p).join("Rockstar Games")),
            Some(PathBuf::from("C:\\Program Files\\Rockstar Games")),
            Some(PathBuf::from("C:\\Program Files (x86)\\Rockstar Games")),
            Some(PathBuf::from("D:\\Rockstar Games")),
            Some(PathBuf::from("E:\\Rockstar Games")),
        ];

        for dir_opt in rockstar_dirs {
            if let Some(dir) = dir_opt {
                if !dir.exists() {
                    continue;
                }
                if let Ok(entries) = fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_dir() {
                            let name = path.file_name().and_then(|e| e.to_str()).unwrap_or("").to_string();
                            if !name.is_empty() && is_game_dir_name(&name) && name != "Launcher" {
                                if let Some(exe) = find_exe_in_dir_deep(&path, 2) {
                                    games.push(ScannedGame {
                                        id: format!("rockstar-{}", name.to_lowercase().replace(' ', "-")),
                                        name,
                                        platform: "Rockstar".to_string(),
                                        launcher: "Rockstar Games Launcher".to_string(),
                                        install_path: path.to_string_lossy().to_string(),
                                        exe_path: Some(exe.to_string_lossy().to_string()),
                                        app_id: None,
                                        version: None,
                                        icon_path: None,
                                        cover_path: None,
                                        banner_path: None,
                                        install_size: Some(calculate_folder_size(&path)),
                                        scan_confidence: 0.85,
                                        is_installed: true,
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
        55
    }
}
