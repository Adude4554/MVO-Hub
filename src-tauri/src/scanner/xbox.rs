use super::*;
use std::env;
use std::fs;

pub struct XboxScanner;

impl XboxScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for XboxScanner {
    fn platform(&self) -> &str {
        "Xbox"
    }

    fn is_available(&self) -> bool {
        // Check if Xbox app is installed via WindowsApps
        let xbox_paths = vec![
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Microsoft").join("WindowsApps").join("Microsoft.GamingApp")),
            Some(PathBuf::from("C:\\Program Files\\WindowsApps")),
        ];

        xbox_paths.iter().any(|d| {
            if let Some(dir) = d {
                dir.exists()
            } else {
                false
            }
        })
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        // Xbox Game Pass games are installed via WindowsApps
        // This is tricky because WindowsApps has restricted access
        // We'll scan known Xbox game directories

        let xbox_dirs = vec![
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Packages")),
            Some(PathBuf::from("C:\\XboxGames")),
            Some(PathBuf::from("D:\\XboxGames")),
            Some(PathBuf::from("C:\\Program Files\\ModifiableWindowsApps")),
        ];

        for dir_opt in xbox_dirs {
            if let Some(dir) = dir_opt {
                if !dir.exists() {
                    continue;
                }
                if let Ok(entries) = fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_dir() {
                            let name = path.file_name().and_then(|e| e.to_str()).unwrap_or("").to_string();
                            // Xbox packages have specific naming patterns
                            if name.contains("Microsoft.GamingApp") || name.contains("Xbox") {
                                if let Some(exe) = find_exe_in_dir_deep(&path, 3) {
                                    games.push(ScannedGame {
                                        id: format!("xbox-{}", name.to_lowercase().replace(' ', "-")),
                                        name: name.clone(),
                                        platform: "Xbox".to_string(),
                                        launcher: "Xbox App".to_string(),
                                        install_path: path.to_string_lossy().to_string(),
                                        exe_path: Some(exe.to_string_lossy().to_string()),
                                        app_id: None,
                                        version: None,
                                        icon_path: None,
                                        cover_path: None,
                                        banner_path: None,
                                        install_size: Some(calculate_folder_size(&path)),
                                        scan_confidence: 0.7,
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
        60
    }
}
