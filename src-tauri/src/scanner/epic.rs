use super::*;
use std::env;
use std::fs;

pub struct EpicScanner;

impl EpicScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for EpicScanner {
    fn platform(&self) -> &str {
        "Epic"
    }

    fn is_available(&self) -> bool {
        // Check if Epic Games Launcher is installed
        let manifest_dirs = vec![
            env::var("PROGRAMDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Epic").join("EpicGamesLauncher")),
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Epic").join("EpicGamesLauncher")),
        ];

        manifest_dirs.iter().any(|d| {
            if let Some(dir) = d {
                dir.exists()
            } else {
                false
            }
        })
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        let manifest_dirs = vec![
            env::var("PROGRAMDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Epic").join("EpicGamesLauncher").join("Data").join("Manifests")),
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Epic").join("EpicGamesLauncher").join("Saved").join("Config").join("Windows")),
        ];

        for dir_opt in manifest_dirs {
            if let Some(dir) = dir_opt {
                if !dir.exists() {
                    continue;
                }
                if let Ok(entries) = fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|e| e.to_str()) == Some("item") {
                            if let Ok(content) = fs::read_to_string(&path) {
                                if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                                    let name = manifest
                                        .get("DisplayName")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    let install_location = manifest
                                        .get("InstallLocation")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    let catalog_namespace = manifest
                                        .get("CatalogNamespace")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    let app_version = manifest
                                        .get("AppVersionString")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());

                                    if !name.is_empty() && !install_location.is_empty() {
                                        let install_path = PathBuf::from(&install_location);
                                        let is_installed = install_path.exists();

                                        games.push(ScannedGame {
                                            id: format!("epic-{}", catalog_namespace),
                                            name,
                                            platform: "Epic".to_string(),
                                            launcher: "Epic Games".to_string(),
                                            install_path: install_location,
                                            exe_path: None,
                                            app_id: Some(catalog_namespace),
                                            version: app_version,
                                            icon_path: None,
                                            cover_path: None,
                                            banner_path: None,
                                            install_size: if is_installed {
                                                Some(calculate_folder_size(&install_path))
                                            } else {
                                                None
                                            },
                                            scan_confidence: 0.95,
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
        90
    }
}
