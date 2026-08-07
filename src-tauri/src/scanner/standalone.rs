use super::*;
use std::collections::HashSet;
use std::env;
use std::fs;

pub struct StandaloneScanner;

impl StandaloneScanner {
    pub fn new() -> Self {
        Self
    }

    fn scan_directory(&self, dir: &PathBuf, games: &mut Vec<ScannedGame>, seen: &mut HashSet<String>, depth: u32) {
        if depth == 0 || games.len() > 500 {
            return;
        }

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }

                let name = path.file_name().and_then(|e| e.to_str()).unwrap_or("").to_string();
                if name.is_empty() || !is_game_dir_name(&name) {
                    continue;
                }

                // Check for executable
                if let Some(exe) = find_exe_in_dir_deep(&path, 2) {
                    let key = format!("standalone:{}", exe.to_string_lossy().to_lowercase());
                    if seen.insert(key) {
                        games.push(ScannedGame {
                            id: format!("standalone-{}", name.to_lowercase().replace(' ', "-")),
                            name,
                            platform: "Standalone".to_string(),
                            launcher: "Standalone".to_string(),
                            install_path: path.to_string_lossy().to_string(),
                            exe_path: Some(exe.to_string_lossy().to_string()),
                            app_id: None,
                            version: None,
                            icon_path: None,
                            cover_path: None,
                            banner_path: None,
                            install_size: Some(calculate_folder_size(&path)),
                            scan_confidence: 0.5,
                            is_installed: true,
                        });
                    }
                }

                // Recurse into subdirectories
                self.scan_directory(&path, games, seen, depth - 1);
            }
        }
    }
}

impl GameScanner for StandaloneScanner {
    fn platform(&self) -> &str {
        "Standalone"
    }

    fn is_available(&self) -> bool {
        true // Always available
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();
        let mut seen = HashSet::new();

        let home = env::var("USERPROFILE")
            .ok()
            .map(PathBuf::from)
            .unwrap_or_default();

        // Common game directories
        let search_dirs = vec![
            home.join("Downloads"),
            home.join("Desktop"),
            home.join("Documents"),
            PathBuf::from("C:\\Games"),
            PathBuf::from("D:\\Games"),
            PathBuf::from("E:\\Games"),
            PathBuf::from("F:\\Games"),
            PathBuf::from("C:\\Program Files\\Games"),
            PathBuf::from("C:\\Program Files (x86)\\Games"),
        ];

        for dir in search_dirs {
            if dir.exists() {
                self.scan_directory(&dir, &mut games, &mut seen, 3);
            }
        }

        games
    }

    fn priority(&self) -> u32 {
        30 // Lowest priority for standalone games
    }
}
