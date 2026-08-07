use super::*;
use std::env;
use std::fs;

pub struct GogScanner;

impl GogScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for GogScanner {
    fn platform(&self) -> &str {
        "GOG"
    }

    fn is_available(&self) -> bool {
        let gog_paths = vec![
            env::var("PROGRAMDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("GOG.com").join("Galaxy")),
            Some(PathBuf::from("C:\\Program Files (x86)\\GOG Galaxy")),
        ];

        gog_paths.iter().any(|d| {
            if let Some(dir) = d {
                dir.exists()
            } else {
                false
            }
        })
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        let gog_paths = vec![
            env::var("PROGRAMDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("GOG.com").join("Galaxy").join("Library").join("Games")),
            Some(PathBuf::from("C:\\GOG Games")),
            Some(PathBuf::from("C:\\Program Files (x86)\\GOG Galaxy").join("Games")),
        ];

        for dir_opt in gog_paths {
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
                                // Look for exe in directory
                                if let Some(exe) = find_exe_in_dir_deep(&path, 2) {
                                    games.push(ScannedGame {
                                        id: format!("gog-{}", name.to_lowercase().replace(' ', "-")),
                                        name,
                                        platform: "GOG".to_string(),
                                        launcher: "GOG Galaxy".to_string(),
                                        install_path: exe.to_string_lossy().to_string(),
                                        exe_path: Some(exe.to_string_lossy().to_string()),
                                        app_id: None,
                                        version: None,
                                        icon_path: None,
                                        cover_path: None,
                                        banner_path: None,
                                        install_size: Some(calculate_folder_size(&path)),
                                        scan_confidence: 0.9,
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
        85
    }
}
