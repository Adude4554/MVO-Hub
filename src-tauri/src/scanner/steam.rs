use super::*;
use std::collections::HashSet;
use std::fs;
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub struct SteamScanner;

impl SteamScanner {
    pub fn new() -> Self {
        Self
    }

    fn find_steam_path() -> Option<PathBuf> {
        // Try registry via cmd
        let output = Command::new("cmd")
            .args([
                "/C",
                "reg",
                "query",
                "HKCU\\Software\\Valve\\Steam",
                "/v",
                "SteamPath",
            ])
            .creation_flags(0x08000000)
            .output()
            .ok()?;

        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("SteamPath") && line.contains("REG_SZ") {
                    if let Some(index) = line.find("REG_SZ") {
                        let value = line[index + "REG_SZ".len()..].trim();
                        if !value.is_empty() {
                            let p = PathBuf::from(value.replace('/', "\\"));
                            if p.exists() {
                                return Some(p);
                            }
                        }
                    }
                }
            }
        }

        // Try common paths
        let candidates = vec![
            PathBuf::from("C:\\Program Files (x86)\\Steam"),
            PathBuf::from("C:\\Program Files\\Steam"),
            PathBuf::from("D:\\Steam"),
            PathBuf::from("E:\\Steam"),
            PathBuf::from("D:\\steam app"),
        ];

        for candidate in candidates {
            if candidate.join("steam.exe").exists() || candidate.join("steamapps").exists() {
                return Some(candidate);
            }
        }

        None
    }

    fn find_library_paths(steam_path: &PathBuf) -> Vec<PathBuf> {
        let mut libraries = vec![steam_path.clone()];
        let libraryfolders = steam_path.join("steamapps").join("libraryfolders.vdf");

        if let Ok(content) = fs::read_to_string(&libraryfolders) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.contains("\"path\"") {
                    if let Some(start) = trimmed.find('"') {
                        if let Some(end) = trimmed.rfind('"') {
                            if start < end {
                                let path_str = &trimmed[start + 1..end];
                                let path = PathBuf::from(path_str.replace("\\\\", "\\").replace('/', "\\"));
                                if path.exists() {
                                    libraries.push(path);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Also scan drive letters
        for drive in 'C'..='Z' {
            let base = PathBuf::from(format!("{}:\\", drive));
            if !base.exists() {
                continue;
            }
            let candidates = vec![
                base.join("Steam"),
                base.join("steam app"),
                base.join("SteamLibrary"),
                base.join("Games").join("Steam"),
            ];
            for candidate in candidates {
                if candidate.join("steamapps").exists() || candidate.join("steam.exe").exists() {
                    if !libraries.contains(&candidate) {
                        libraries.push(candidate);
                    }
                }
            }
        }

        libraries
    }

    fn extract_acf_value(content: &str, key: &str) -> String {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.contains(key) {
                // ACF format: "key"\t\t"value"
                // Find the value between the last pair of quotes
                let parts: Vec<&str> = trimmed.split('"').collect();
                if parts.len() >= 4 {
                    return parts[3].to_string();
                }
            }
        }
        String::new()
    }
}

impl GameScanner for SteamScanner {
    fn platform(&self) -> &str {
        "Steam"
    }

    fn is_available(&self) -> bool {
        Self::find_steam_path().is_some()
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();
        let steam_path = match Self::find_steam_path() {
            Some(p) => p,
            None => return games,
        };

        let libraries = Self::find_library_paths(&steam_path);
        let mut seen_ids = HashSet::new();

        for library in &libraries {
            let steamapps = library.join("steamapps");
            if let Ok(entries) = fs::read_dir(&steamapps) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with("appmanifest_") && name.ends_with(".acf") {
                            if let Ok(content) = fs::read_to_string(&path) {
                                let app_id = Self::extract_acf_value(&content, "appid");
                                let game_name = Self::extract_acf_value(&content, "name");
                                let install_dir = Self::extract_acf_value(&content, "installdir");

                                if !app_id.is_empty() && !game_name.is_empty() {
                                    if !seen_ids.insert(app_id.clone()) {
                                        continue;
                                    }

                                    let game_path = library.join("steamapps").join("common").join(&install_dir);
                                    let is_installed = game_path.exists();

                                    games.push(ScannedGame {
                                        id: format!("steam-{}", app_id),
                                        name: game_name,
                                        platform: "Steam".to_string(),
                                        launcher: "Steam".to_string(),
                                        install_path: game_path.to_string_lossy().to_string(),
                                        exe_path: None, // Will be found during metadata phase
                                        app_id: Some(app_id),
                                        version: None,
                                        icon_path: None,
                                        cover_path: Some(format!(
                                            "https://cdn.akamai.steamstatic.com/steam/apps/{}/header.jpg",
                                            Self::extract_acf_value(&content, "appid")
                                        )),
                                        banner_path: None,
                                        install_size: if is_installed {
                                            Some(calculate_folder_size(&game_path))
                                        } else {
                                            None
                                        },
                                        scan_confidence: 1.0,
                                        is_installed,
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
        100 // Steam is highest priority
    }
}
