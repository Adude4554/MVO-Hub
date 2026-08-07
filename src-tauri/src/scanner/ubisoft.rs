use super::*;
use std::env;
use std::fs;
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub struct UbisoftScanner;

impl UbisoftScanner {
    pub fn new() -> Self {
        Self
    }
}

impl GameScanner for UbisoftScanner {
    fn platform(&self) -> &str {
        "Ubisoft"
    }

    fn is_available(&self) -> bool {
        let ubisoft_paths = vec![
            env::var("LOCALAPPDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("Ubisoft Game Launcher")),
            Some(PathBuf::from("C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher")),
            Some(PathBuf::from("C:\\Program Files\\Ubisoft\\Ubisoft Game Launcher")),
        ];

        ubisoft_paths.iter().any(|d| {
            if let Some(dir) = d {
                dir.exists()
            } else {
                false
            }
        })
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        // Ubisoft Connect stores game registry entries
        let output = Command::new("cmd")
            .args([
                "/C",
                "reg",
                "query",
                "HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher",
                "/v",
                "InstallDir",
            ])
            .creation_flags(0x08000000)
            .output()
            .ok();

        if let Some(out) = output {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                for line in text.lines() {
                    if line.contains("InstallDir") && line.contains("REG_SZ") {
                        if let Some(index) = line.find("REG_SZ") {
                            let value = line[index + "REG_SZ".len()..].trim();
                            if !value.is_empty() {
                                let ubisoft_path = PathBuf::from(value);
                                if ubisoft_path.exists() {
                                    // Scan for games in the Ubisoft directory
                                    if let Ok(entries) = fs::read_dir(&ubisoft_path) {
                                        for entry in entries.flatten() {
                                            let path = entry.path();
                                            if path.is_dir() {
                                                let name = path.file_name().and_then(|e| e.to_str()).unwrap_or("").to_string();
                                                if !name.is_empty() && is_game_dir_name(&name) {
                                                    if let Some(exe) = find_exe_in_dir_deep(&path, 2) {
                                                        games.push(ScannedGame {
                                                            id: format!("ubisoft-{}", name.to_lowercase().replace(' ', "-")),
                                                            name,
                                                            platform: "Ubisoft".to_string(),
                                                            launcher: "Ubisoft Connect".to_string(),
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
                        }
                    }
                }
            }
        }

        // Also scan common Ubisoft install locations
        let ubisoft_dirs = vec![
            PathBuf::from("C:\\Program Files (x86)\\Ubisoft"),
            PathBuf::from("C:\\Program Files\\Ubisoft"),
            PathBuf::from("D:\\Ubisoft"),
            PathBuf::from("E:\\Ubisoft"),
        ];

        for dir in ubisoft_dirs {
            if !dir.exists() {
                continue;
            }
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let name = path.file_name().and_then(|e| e.to_str()).unwrap_or("").to_string();
                        if !name.is_empty() && is_game_dir_name(&name) && name != "Ubisoft Game Launcher" {
                            if let Some(exe) = find_exe_in_dir_deep(&path, 2) {
                                games.push(ScannedGame {
                                    id: format!("ubisoft-{}", name.to_lowercase().replace(' ', "-")),
                                    name,
                                    platform: "Ubisoft".to_string(),
                                    launcher: "Ubisoft Connect".to_string(),
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
        75
    }
}
