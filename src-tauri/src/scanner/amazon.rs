use super::*;
use std::env;
use std::fs;

pub struct AmazonScanner;

impl AmazonScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for AmazonScanner {
    fn platform(&self) -> &str {
        "Amazon"
    }

    fn is_available(&self) -> bool {
        let amazon_paths = vec![
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Amazon Games")),
            Some(PathBuf::from("C:\\Program Files\\Amazon Games")),
        ];

        amazon_paths.iter().any(|d| {
            if let Some(dir) = d {
                dir.exists()
            } else {
                false
            }
        })
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        let amazon_dirs = vec![
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Amazon Games").join("Library")),
            Some(PathBuf::from("C:\\Program Files\\Amazon Games")),
            Some(PathBuf::from("D:\\Amazon Games")),
        ];

        for dir_opt in amazon_dirs {
            if let Some(dir) = dir_opt {
                if !dir.exists() {
                    continue;
                }
                if let Ok(entries) = fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_dir() {
                            let name = path.file_name().and_then(|e| e.to_str()).unwrap_or("").to_string();
                            if !name.is_empty() && is_game_dir_name(&name) {
                                if let Some(exe) = find_exe_in_dir_deep(&path, 2) {
                                    games.push(ScannedGame {
                                        id: format!("amazon-{}", name.to_lowercase().replace(' ', "-")),
                                        name,
                                        platform: "Amazon".to_string(),
                                        launcher: "Amazon Games".to_string(),
                                        install_path: path.to_string_lossy().to_string(),
                                        exe_path: Some(exe.to_string_lossy().to_string()),
                                        app_id: None,
                                        version: None,
                                        icon_path: None,
                                        cover_path: None,
                                        banner_path: None,
                                        install_size: Some(calculate_folder_size(&path)),
                                        scan_confidence: 0.8,
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
