use super::*;
use std::env;
use std::fs;

pub struct EaScanner;

impl EaScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for EaScanner {
    fn platform(&self) -> &str {
        "EA"
    }

    fn is_available(&self) -> bool {
        let ea_paths = vec![
            env::var("PROGRAMDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Electronic Arts").join("EA Desktop")),
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Electronic Arts").join("EA Desktop")),
            Some(PathBuf::from("C:\\Program Files\\Electronic Arts\\EA Desktop")),
            Some(PathBuf::from("C:\\Program Files (x86)\\Origin")),
        ];

        ea_paths.iter().any(|d| {
            if let Some(dir) = d {
                dir.exists()
            } else {
                false
            }
        })
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        // EA App stores manifests in ProgramData
        let manifest_dirs = vec![
            env::var("PROGRAMDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Electronic Arts").join("EA Desktop").join("Metadata")),
            env::var("PROGRAMDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Electronic Arts").join("Origin").join("LocalContent")),
        ];

        for dir_opt in manifest_dirs {
            if let Some(dir) = dir_opt {
                if !dir.exists() {
                    continue;
                }
                // Scan for manifest files
                if let Ok(entries) = fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_dir() {
                            // Look for manifest JSON files
                            if let Ok(sub_entries) = fs::read_dir(&path) {
                                for sub_entry in sub_entries.flatten() {
                                    let sub_path = sub_entry.path();
                                    if sub_path.extension().and_then(|e| e.to_str()) == Some("json") {
                                        if let Ok(content) = fs::read_to_string(&sub_path) {
                                            if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                                                let name = manifest
                                                    .get("appName")
                                                    .and_then(|v| v.as_str())
                                                    .or_else(|| manifest.get("displayName").and_then(|v| v.as_str()))
                                                    .unwrap_or("")
                                                    .to_string();
                                                let install_path = manifest
                                                    .get("installPath")
                                                    .and_then(|v| v.as_str())
                                                    .unwrap_or("")
                                                    .to_string();

                                                if !name.is_empty() && !install_path.is_empty() {
                                                    let path = PathBuf::from(&install_path);
                                                    games.push(ScannedGame {
                                                        id: format!("ea-{}", name.to_lowercase().replace(' ', "-")),
                                                        name,
                                                        platform: "EA".to_string(),
                                                        launcher: "EA App".to_string(),
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
                                                        scan_confidence: 0.85,
                                                        is_installed: path.exists(),
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Also scan common EA install directories
        let ea_dirs = vec![
            PathBuf::from("C:\\Program Files\\EA Games"),
            PathBuf::from("C:\\Program Files (x86)\\EA Games"),
            PathBuf::from("D:\\EA Games"),
            PathBuf::from("E:\\EA Games"),
        ];

        for dir in ea_dirs {
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
                                    id: format!("ea-{}", name.to_lowercase().replace(' ', "-")),
                                    name,
                                    platform: "EA".to_string(),
                                    launcher: "EA App".to_string(),
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

        games
    }

    fn priority(&self) -> u32 {
        80
    }
}
