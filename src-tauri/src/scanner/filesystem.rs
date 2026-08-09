use crate::scanner::confidence::{ConfidenceReason, ConfidenceScore};
use crate::scanner::executable::{self, ExeClassification};
use crate::scanner::ScannedGame;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[cfg(target_os = "windows")]
pub fn discover_drives() -> Vec<PathBuf> {
    let mut drives = Vec::new();
    for letter in 'A'..='Z' {
        let path = PathBuf::from(format!("{}:\\", letter));
        if path.exists() {
            if let Ok(meta) = std::fs::metadata(&path) {
                if meta.is_dir() {
                    drives.push(path);
                }
            }
        }
    }
    drives
}

#[cfg(not(target_os = "windows"))]
pub fn discover_drives() -> Vec<PathBuf> {
    vec![PathBuf::from("/"), PathBuf::from("/home")]
}

pub fn get_common_game_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();

    let home = dirs::home_dir().unwrap_or_default();
    let data_local = dirs::data_local_dir().unwrap_or_default();

    let candidates = vec![
        home.join("Downloads"),
        home.join("Desktop"),
        home.join("Documents"),
        home.join("Games"),
        PathBuf::from("C:\\Games"),
        PathBuf::from("C:\\Program Files\\Games"),
        PathBuf::from("C:\\Program Files (x86)\\Games"),
        PathBuf::from("D:\\Games"),
        PathBuf::from("E:\\Games"),
        PathBuf::from("F:\\Games"),
        data_local.join("Programs"),
    ];

    for root in candidates {
        let canonical = root.canonicalize().unwrap_or(root.clone());
        if seen.insert(canonical.clone()) && canonical.exists() {
            roots.push(root);
        }
    }

    for letter in 'D'..='Z' {
        let drive = PathBuf::from(format!("{}:\\", letter));
        if drive.exists() {
            for subdir in &["Games", "My Games", "SteamLibrary", "GOG Games",
                            "EA Games", "Origin Games", "Ubisoft", "Riot Games"] {
                let path = drive.join(subdir);
                if path.exists() {
                    let canonical = path.canonicalize().unwrap_or(path.clone());
                    if seen.insert(canonical) {
                        roots.push(path);
                    }
                }
            }
        }
    }

    roots
}

pub struct FilesystemScanner {
    progress: Option<Arc<dyn Fn(&str) + Send + Sync>>,
    scan_cache: Arc<Mutex<ScanCache>>,
}

struct ScanCache {
    scanned_dirs: HashSet<PathBuf>,
    dir_timestamps: std::collections::HashMap<PathBuf, std::time::SystemTime>,
}

impl ScanCache {
    fn new() -> Self {
        Self {
            scanned_dirs: HashSet::new(),
            dir_timestamps: std::collections::HashMap::new(),
        }
    }

    fn needs_rescan(&self, dir: &Path) -> bool {
        let Ok(meta) = std::fs::metadata(dir) else { return false; };
        let Ok(modified) = meta.modified() else { return true; };
        match self.dir_timestamps.get(dir) {
            Some(last) => modified > *last,
            None => true,
        }
    }

    fn mark_scanned(&mut self, dir: &Path, modified: std::time::SystemTime) {
        self.scanned_dirs.insert(dir.to_path_buf());
        self.dir_timestamps.insert(dir.to_path_buf(), modified);
    }
}

impl FilesystemScanner {
    pub fn new(progress: Option<Arc<dyn Fn(&str) + Send + Sync>>) -> Self {
        Self {
            progress,
            scan_cache: Arc::new(Mutex::new(ScanCache::new())),
        }
    }

    fn emit_progress(&self, msg: &str) {
        if let Some(ref cb) = self.progress {
            cb(msg);
        }
    }

    pub fn scan_roots(&self, roots: &[PathBuf]) -> Vec<ScannedGame> {
        let games = Arc::new(Mutex::new(Vec::<ScannedGame>::new()));
        let seen = Arc::new(Mutex::new(HashSet::<String>::new()));

        for root in roots {
            self.emit_progress(&format!("Scanning {}", root.display()));
            self.scan_directory_recursive(root, 3, &games, &seen);
        }

        let result = games.lock().unwrap().clone();
        self.emit_progress(&format!("Filesystem scan complete: {} games found", result.len()));
        result
    }

    fn scan_directory_recursive(
        &self,
        dir: &Path,
        depth: u32,
        games: &Arc<Mutex<Vec<ScannedGame>>>,
        seen: &Arc<Mutex<HashSet<String>>>,
    ) {
        if depth == 0 { return; }
        if games.lock().unwrap().len() > 2000 { return; }

        let Ok(entries) = std::fs::read_dir(dir) else { return; };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() { continue; }

            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            if name.is_empty() || super::filter::should_skip_directory(&name) { continue; }
            if super::filter::is_system_directory(&path) { continue; }

            let _dir_name = name.to_lowercase();

            let has_steam_appid = path.join("steam_appid.txt").exists();
            let has_gog_info = has_gog_info_file(&path);
            let has_epic_manifest = has_epic_manifest(&path);

            if has_steam_appid || has_gog_info || has_epic_manifest {
                if let Some(game) = self.try_create_game_from_dir(&path, &name) {
                    let mut seen_lock = seen.lock().unwrap();
                    let key = game.id.clone();
                    if seen_lock.insert(key) {
                        games.lock().unwrap().push(game);
                    }
                }
                continue;
            }

            let candidates = executable::find_executables_in_dir(&path, 1);
            let game_exe = candidates.iter().find(|c| {
                let class = executable::classify_executable(&c.path);
                class == ExeClassification::PossibleGame
            });

            if let Some(exe) = game_exe {
                if let Some(game) = self.create_game_from_exe(&path, exe) {
                    let mut seen_lock = seen.lock().unwrap();
                    let key = game.id.clone();
                    if seen_lock.insert(key) {
                        games.lock().unwrap().push(game);
                    }
                    continue;
                }
            }

            if super::filter::is_game_directory_candidate(&name) {
                let (dir_score, dir_signals) = super::filter::game_dir_signature_score(&path);
                if dir_score >= 10 {
                    let game = self.create_game_from_directory(&path, &name, dir_score, &dir_signals);
                    let mut seen_lock = seen.lock().unwrap();
                    let key = game.id.clone();
                    if seen_lock.insert(key) {
                        games.lock().unwrap().push(game);
                    }
                }
            }

            self.scan_directory_recursive(&path, depth - 1, games, seen);
        }
    }

    fn try_create_game_from_dir(&self, dir: &Path, name: &str) -> Option<ScannedGame> {
        let mut confidence = ConfidenceScore::new();

        if dir.join("steam_appid.txt").exists() {
            confidence.add(ConfidenceReason::SteamAppId);
        }
        if has_gog_info_file(dir) {
            confidence.add(ConfidenceReason::GogInfoFile);
        }
        if has_epic_manifest(dir) {
            confidence.add(ConfidenceReason::EpicManifest);
        }

        let candidates = executable::find_executables_in_dir(dir, 2);
        let exe = candidates.iter().find(|c| {
            let class = executable::classify_executable(&c.path);
            class == ExeClassification::PossibleGame
        });

        let exe_path = exe.map(|e| e.path.to_string_lossy().to_string());

        let install_size = super::calculate_folder_size(&dir.to_path_buf());

        Some(ScannedGame {
            id: format!("fs:{}", dir.to_string_lossy().to_lowercase().replace('\\', "/")),
            name: name.to_string(),
            platform: "Filesystem".to_string(),
            launcher: "Filesystem".to_string(),
            install_path: dir.to_string_lossy().to_string(),
            exe_path,
            app_id: None,
            version: None,
            icon_path: None,
            cover_path: None,
            banner_path: None,
            install_size: Some(install_size),
            scan_confidence: (confidence.score / 100.0).min(1.0),
            is_installed: true,
        })
    }

    fn create_game_from_exe(&self, dir: &Path, exe: &executable::ExeCandidate) -> Option<ScannedGame> {
        let mut confidence = ConfidenceScore::new();

        if let Some(ref meta) = exe.metadata {
            if let Some(ref company) = meta.company_name {
                if !company.is_empty() {
                    confidence.add(ConfidenceReason::KnownPublisher);
                }
            }
            if let Some(ref desc) = meta.file_description {
                if !desc.is_empty() {
                    confidence.add(ConfidenceReason::ExecutableMetadata);
                }
            }
        }

        confidence.add(ConfidenceReason::GameDirectorySignature);

        let name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("Unknown").to_string();
        let install_size = super::calculate_folder_size(&dir.to_path_buf());

        Some(ScannedGame {
            id: format!("fs:{}", exe.path.to_string_lossy().to_lowercase().replace('\\', "/")),
            name,
            platform: "Filesystem".to_string(),
            launcher: "Filesystem".to_string(),
            install_path: dir.to_string_lossy().to_string(),
            exe_path: Some(exe.path.to_string_lossy().to_string()),
            app_id: None,
            version: exe.metadata.as_ref().and_then(|m| m.product_version.clone()),
            icon_path: None,
            cover_path: None,
            banner_path: None,
            install_size: Some(install_size),
            scan_confidence: (confidence.score / 100.0).min(1.0),
            is_installed: true,
        })
    }

    fn create_game_from_directory(&self, dir: &Path, name: &str, dir_score: i32, _signals: &[String]) -> ScannedGame {
        let mut confidence = ConfidenceScore::new();
        confidence.raw_add(dir_score as f32, ConfidenceReason::GameDirectorySignature);

        let install_size = super::calculate_folder_size(&dir.to_path_buf());
        let exe_path = executable::find_executables_in_dir(dir, 1)
            .into_iter()
            .find(|c| executable::classify_executable(&c.path) == ExeClassification::PossibleGame)
            .map(|c| c.path.to_string_lossy().to_string());

        ScannedGame {
            id: format!("fs:{}", dir.to_string_lossy().to_lowercase().replace('\\', "/")),
            name: name.to_string(),
            platform: "Filesystem".to_string(),
            launcher: "Filesystem".to_string(),
            install_path: dir.to_string_lossy().to_string(),
            exe_path,
            app_id: None,
            version: None,
            icon_path: None,
            cover_path: None,
            banner_path: None,
            install_size: Some(install_size),
            scan_confidence: (confidence.score / 100.0).min(1.0),
            is_installed: true,
        }
    }
}

fn has_gog_info_file(dir: &Path) -> bool {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("goggame-") && name.ends_with(".info") {
                return true;
            }
        }
    }
    false
}

fn has_epic_manifest(dir: &Path) -> bool {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".item") && entry.path().is_file() {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discover_drives_not_empty() {
        let drives = discover_drives();
        assert!(!drives.is_empty());
    }

    #[test]
    fn test_get_common_game_roots() {
        let roots = get_common_game_roots();
        assert!(!roots.is_empty());
    }

    #[test]
    fn test_has_gog_info_false() {
        let dir = std::env::temp_dir().join("mvo_test_gog");
        let _ = std::fs::create_dir_all(&dir);
        assert!(!has_gog_info_file(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_has_gog_info_true() {
        let dir = std::env::temp_dir().join("mvo_test_gog2");
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join("goggame-12345.info"), "{}");
        assert!(has_gog_info_file(&dir));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
