use super::*;
use std::env;

pub struct MinecraftScanner;

impl MinecraftScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for MinecraftScanner {
    fn platform(&self) -> &str {
        "Minecraft"
    }

    fn is_available(&self) -> bool {
        let mc_paths = vec![
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Packages").join("Microsoft.MinecraftUWP_8wekyb3d8bbwe")),
            Some(PathBuf::from("C:\\Program Files (x86)\\Minecraft Launcher")),
            Some(PathBuf::from("C:\\Program Files\\Minecraft Launcher")),
        ];

        mc_paths.iter().any(|d| {
            if let Some(dir) = d {
                dir.exists()
            } else {
                false
            }
        })
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        // Minecraft Java Edition
        let mc_java_paths = vec![
            env::var("APPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join(".minecraft")),
            Some(PathBuf::from("C:\\Users\\AppData\\Roaming\\.minecraft")),
        ];

        for dir_opt in mc_java_paths {
            if let Some(dir) = dir_opt {
                if dir.exists() {
                    games.push(ScannedGame {
                        id: "minecraft-java".to_string(),
                        name: "Minecraft: Java Edition".to_string(),
                        platform: "Minecraft".to_string(),
                        launcher: "Minecraft Launcher".to_string(),
                        install_path: dir.to_string_lossy().to_string(),
                        exe_path: None, // Java games don't have a direct exe
                        app_id: None,
                        version: None,
                        icon_path: None,
                        cover_path: None,
                        banner_path: None,
                        install_size: Some(calculate_folder_size(&dir)),
                        scan_confidence: 0.95,
                        is_installed: true,
                    });
                    break;
                }
            }
        }

        // Minecraft Bedrock Edition (Windows Store)
        let mc_bedrock_paths = vec![
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Packages").join("Microsoft.MinecraftUWP_8wekyb3d8bbwe")),
        ];

        for dir_opt in mc_bedrock_paths {
            if let Some(dir) = dir_opt {
                if dir.exists() {
                    games.push(ScannedGame {
                        id: "minecraft-bedrock".to_string(),
                        name: "Minecraft: Bedrock Edition".to_string(),
                        platform: "Minecraft".to_string(),
                        launcher: "Minecraft Launcher".to_string(),
                        install_path: dir.to_string_lossy().to_string(),
                        exe_path: None, // Windows Store app
                        app_id: None,
                        version: None,
                        icon_path: None,
                        cover_path: None,
                        banner_path: None,
                        install_size: Some(calculate_folder_size(&dir)),
                        scan_confidence: 0.9,
                        is_installed: true,
                    });
                    break;
                }
            }
        }

        games
    }

    fn priority(&self) -> u32 {
        45
    }
}
