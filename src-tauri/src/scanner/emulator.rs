use super::*;
use std::fs;

pub struct EmulatorScanner;

impl EmulatorScanner {
    pub fn new() -> Self {
        Self
    }

    fn scan_emulator(&self, name: &str, paths: Vec<Option<PathBuf>>) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        for dir_opt in paths {
            if let Some(dir) = dir_opt {
                if !dir.exists() {
                    continue;
                }

                // Look for ROM directories
                let rom_dirs = vec![
                    dir.join("roms"),
                    dir.join("ROMs"),
                    dir.join("games"),
                    dir.join("Games"),
                    dir.clone(),
                ];

                for rom_dir in rom_dirs {
                    if !rom_dir.exists() {
                        continue;
                    }
                    if let Ok(entries) = fs::read_dir(&rom_dir) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if path.is_file() {
                                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                                // Common ROM extensions
                                if matches!(
                                    ext.to_lowercase().as_str(),
                                    "nes" | "snes" | "gba" | "gbc" | "gb" | "n64" | "z64" | "v64"
                                    | "md" | "gen" | "sms" | "gg" | "pce" | "ngp" | "ngc"
                                    | "psx" | "iso" | "bin" | "cue" | "pbp" | "cso"
                                    | "nds" | "3ds" | "cia" | "cxi"
                                    | "ps2"
                                    | "psp"
                                    | "wii" | "wbfs" | "rvz"
                                    | "wiiu" | "wud" | "wux"
                                    | "switch" | "nca" | "nsp" | "xci"
                                    | "arcade" | "zip" | "7z" | "rar"
                                    | "atari" | "a26" | "a52" | "a78" | "lyx"
                                    | "colecovision" | "col" | "intellivision" | "int"
                                    | "segacd" | "32x"
                                ) {
                                    let game_name = path
                                        .file_stem()
                                        .and_then(|n| n.to_str())
                                        .unwrap_or("Unknown ROM")
                                        .to_string();

                                    games.push(ScannedGame {
                                        id: format!("emu-{}-{}", name.to_lowercase(), game_name.to_lowercase().replace(' ', "-")),
                                        name: game_name,
                                        platform: "Emulator".to_string(),
                                        launcher: format!("{} Emulator", name),
                                        install_path: path.to_string_lossy().to_string(),
                                        exe_path: None, // ROMs don't have exes
                                        app_id: None,
                                        version: None,
                                        icon_path: None,
                                        cover_path: None,
                                        banner_path: None,
                                        install_size: Some(path.metadata().map(|m| m.len()).unwrap_or(0)),
                                        scan_confidence: 0.6,
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
}

impl GameScanner for EmulatorScanner {
    fn platform(&self) -> &str {
        "Emulator"
    }

    fn is_available(&self) -> bool {
        // Check for any known emulators
        let emulator_paths = vec![
            "C:\\Program Files\\RetroArch",
            "C:\\Program Files (x86)\\RetroArch",
            "C:\\RetroArch",
            "D:\\Emulators",
            "E:\\Emulators",
        ];

        emulator_paths.iter().any(|p| PathBuf::from(p).exists())
    }

    fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();

        // RetroArch
        let retroarch_paths = vec![
            Some(PathBuf::from("C:\\Program Files\\RetroArch")),
            Some(PathBuf::from("C:\\Program Files (x86)\\RetroArch")),
            Some(PathBuf::from("C:\\RetroArch")),
            Some(PathBuf::from("D:\\RetroArch")),
        ];
        games.extend(self.scan_emulator("RetroArch", retroarch_paths));

        // Known standalone emulators
        let emulator_dirs = vec![
            ("Dolphin", vec![
                Some(PathBuf::from("C:\\Program Files\\Dolphin")),
                Some(PathBuf::from("C:\\Program Files (x86)\\Dolphin")),
                Some(PathBuf::from("D:\\Emulators\\Dolphin")),
            ]),
            ("PCSX2", vec![
                Some(PathBuf::from("C:\\Program Files\\PCSX2")),
                Some(PathBuf::from("C:\\Program Files (x86)\\PCSX2")),
                Some(PathBuf::from("D:\\Emulators\\PCSX2")),
            ]),
            ("RPCS3", vec![
                Some(PathBuf::from("C:\\Program Files\\RPCS3")),
                Some(PathBuf::from("D:\\Emulators\\RPCS3")),
            ]),
            ("Yuzu", vec![
                Some(PathBuf::from("C:\\Program Files\\Yuzu")),
                Some(PathBuf::from("D:\\Emulators\\Yuzu")),
            ]),
            ("Ryujinx", vec![
                Some(PathBuf::from("C:\\Program Files\\Ryujinx")),
                Some(PathBuf::from("D:\\Emulators\\Ryujinx")),
            ]),
            ("Cemu", vec![
                Some(PathBuf::from("C:\\Program Files\\Cemu")),
                Some(PathBuf::from("D:\\Emulators\\Cemu")),
            ]),
        ];

        for (name, paths) in emulator_dirs {
            games.extend(self.scan_emulator(name, paths));
        }

        // Scan general emulator directories
        let general_dirs = vec![
            Some(PathBuf::from("D:\\Emulators")),
            Some(PathBuf::from("E:\\Emulators")),
            Some(PathBuf::from("D:\\ROMs")),
            Some(PathBuf::from("E:\\ROMs")),
            Some(PathBuf::from("D:\\Games\\Emulators")),
        ];

        for dir_opt in general_dirs {
            if let Some(dir) = dir_opt {
                if dir.exists() {
                    if let Ok(entries) = fs::read_dir(&dir) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if path.is_dir() {
                                let name = path.file_name().and_then(|e| e.to_str()).unwrap_or("").to_string();
                                if !name.is_empty() && is_game_dir_name(&name) {
                                    // Check if this looks like an emulator directory
                                    let has_roms = path.join("roms").exists() || path.join("ROMs").exists();
                                    if has_roms {
                                        games.extend(self.scan_emulator(&name, vec![Some(path)]));
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
        40
    }
}
