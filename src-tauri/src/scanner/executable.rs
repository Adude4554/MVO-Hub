use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExeMetadata {
    pub file_name: String,
    pub file_size: u64,
    pub product_name: Option<String>,
    pub file_description: Option<String>,
    pub company_name: Option<String>,
    pub original_filename: Option<String>,
    pub product_version: Option<String>,
    pub file_version: Option<String>,
    pub is_64_bit: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct ExeCandidate {
    pub path: PathBuf,
    pub metadata: Option<ExeMetadata>,
    pub score: i32,
}

const NON_GAME_EXE_NAMES: &[&str] = &[
    "uninstall", "unins000", "unins001", "unins002",
    "setup", "install", "updater", "update", "patch",
    "crashreporter", "crashhandler", "repair",
    "launcher", "helper", "service", "agent",
    "config", "settings", "preferences",
    "loader", "bootstrapper", "prereq",
    "redist", "oalinst", "dxsetup", "vcrun",
    "dotnetfx", "ndp",
];

const GAME_METADATA_KEYWORDS: &[&str] = &[
    "game", "play", "quest", "adventure", "battle", "combat",
    "race", "drive", "fly", "shoot", "sword", "magic",
    "dragon", "hero", "warrior", "legend", "chronicle",
    "tycoon", "simulator", "manager", "builder", "craft",
];

const KNOWN_GAME_COMPANIES: &[&str] = &[
    "valve", "electronic arts", "ea", "ubisoft", "blizzard", "activision",
    "bethesda", "rockstar", "cd projekt", "epic games", "riot games",
    "mojang", "343 industries", "naughty dog", "insomniac", "santa monica",
    "bioware", "obsidian", "inxile", "larian", "supergiant",
    "team cherry", "microsoft studios", "square enix", "capcom", "konami",
    "sega", "namco", "bandai", "koei", "atlus", "xseed",
];

pub fn analyze_executable(exe_path: &Path) -> Option<ExeMetadata> {
    let file_name = exe_path.file_name()?.to_str()?.to_string();
    let file_size = std::fs::metadata(exe_path).ok()?.len();

    let metadata = ExeMetadata {
        file_name,
        file_size,
        product_name: read_exe_string_resource(exe_path, "ProductName"),
        file_description: read_exe_string_resource(exe_path, "FileDescription"),
        company_name: read_exe_string_resource(exe_path, "CompanyName"),
        original_filename: read_exe_string_resource(exe_path, "OriginalFilename"),
        product_version: read_exe_string_resource(exe_path, "ProductVersion"),
        file_version: read_exe_string_resource(exe_path, "FileVersion"),
        is_64_bit: detect_pe_architecture(exe_path),
    };

    Some(metadata)
}

fn read_exe_string_resource(exe_path: &Path, _key: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;

        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", &format!(
                "(Get-Item '{}').VersionInfo.{}", exe_path.display(), _key
            )])
            .creation_flags(0x08000000)
            .output()
            .ok()?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() || stdout.contains("error") || stdout.contains("Exception") {
            None
        } else {
            Some(stdout)
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

fn detect_pe_architecture(exe_path: &Path) -> Option<bool> {
    let data = std::fs::read(exe_path).ok()?;
    if data.len() < 0x40 { return None; }

    let pe_offset = u32::from_le_bytes(data[0x3C..0x40].try_into().ok()?) as usize;
    if pe_offset + 24 >= data.len() { return None; }

    let magic = u16::from_le_bytes(data[pe_offset..pe_offset + 2].try_into().ok()?);
    Some(magic == 0x020B)
}

pub fn find_executables_in_dir(dir: &Path, max_depth: u32) -> Vec<ExeCandidate> {
    let mut candidates = Vec::new();
    find_executables_recursive(dir, max_depth, &mut candidates);
    candidates.sort_by(|a, b| b.score.cmp(&a.score));
    candidates
}

fn find_executables_recursive(dir: &Path, depth: u32, candidates: &mut Vec<ExeCandidate>) {
    if depth == 0 { return; }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                find_executables_recursive(&path, depth - 1, candidates);
            } else if path.extension().and_then(|e| e.to_str()) == Some("exe") {
                let candidate = score_executable(&path);
                candidates.push(candidate);
            }
        }
    }
}

pub fn score_executable(exe_path: &Path) -> ExeCandidate {
    let metadata = analyze_executable(exe_path);
    let mut score = 0i32;
    let name = exe_path.file_stem().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();

    if super::filter::is_protected_executable(&format!("{}.exe", name)) {
        return ExeCandidate { path: exe_path.to_path_buf(), metadata, score: -100 };
    }

    if super::filter::is_likely_utility(&format!("{}.exe", name)) {
        score -= 30;
    }

    if let Some(ref meta) = metadata {
        if let Some(ref desc) = meta.file_description {
            let desc_lower = desc.to_lowercase();
            for kw in GAME_METADATA_KEYWORDS {
                if desc_lower.contains(kw) { score += 15; break; }
            }
            if desc_lower.contains("uninstall") || desc_lower.contains("setup")
                || desc_lower.contains("installer") || desc_lower.contains("updater") {
                score -= 40;
            }
        }

        if let Some(ref company) = meta.company_name {
            let company_lower = company.to_lowercase();
            for known in KNOWN_GAME_COMPANIES {
                if company_lower.contains(known) { score += 20; break; }
            }
        }

        if let Some(ref product_name) = meta.product_name {
            let product_lower = product_name.to_lowercase();
            for kw in GAME_METADATA_KEYWORDS {
                if product_lower.contains(kw) { score += 10; break; }
            }
        }

        if meta.file_size > 50_000_000 { score += 10; }
        else if meta.file_size > 10_000_000 { score += 5; }
        else if meta.file_size < 100_000 { score -= 5; }
    }

    if !name.is_empty() {
        let first_char = name.chars().next().unwrap_or(' ');
        if first_char.is_uppercase() { score += 3; }
    }

    ExeCandidate { path: exe_path.to_path_buf(), metadata, score }
}

pub fn find_primary_executable(dir: &Path) -> Option<ExeCandidate> {
    let candidates = find_executables_in_dir(dir, 3);
    candidates.into_iter().find(|c| c.score > 0)
}

pub fn classify_executable(exe_path: &Path) -> ExeClassification {
    let name = exe_path.file_stem().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
    let meta = analyze_executable(exe_path);

    if super::filter::is_protected_executable(&format!("{}.exe", name)) {
        return ExeClassification::SystemUtility;
    }

    let lower_name = name.clone();
    if lower_name.contains("uninstall") || lower_name.contains("unins") {
        return ExeClassification::Uninstaller;
    }
    if lower_name.contains("setup") || lower_name.contains("install") {
        return ExeClassification::Installer;
    }
    if lower_name.contains("updater") || lower_name.contains("update") || lower_name.contains("patch") {
        return ExeClassification::Updater;
    }
    if lower_name.contains("crashreporter") || lower_name.contains("crash") {
        return ExeClassification::CrashReporter;
    }
    if lower_name.contains("launcher") || lower_name.contains("loader") {
        return ExeClassification::Launcher;
    }
    if lower_name.contains("config") || lower_name.contains("settings") || lower_name.contains("options") {
        return ExeClassification::ConfigurationTool;
    }
    if lower_name.contains("benchmark") || lower_name.contains("test") {
        return ExeClassification::Benchmark;
    }

    if let Some(ref m) = meta {
        if let Some(ref desc) = m.file_description {
            let dl = desc.to_lowercase();
            if dl.contains("uninstall") { return ExeClassification::Uninstaller; }
            if dl.contains("setup") || dl.contains("install") { return ExeClassification::Installer; }
            if dl.contains("updater") { return ExeClassification::Updater; }
        }
    }

    ExeClassification::PossibleGame
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExeClassification {
    PossibleGame,
    Uninstaller,
    Installer,
    Updater,
    CrashReporter,
    Launcher,
    ConfigurationTool,
    Benchmark,
    SystemUtility,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_non_game_exe_names() {
        for name in NON_GAME_EXE_NAMES {
            assert!(super::super::filter::is_protected_executable(&format!("{}.exe", name)),
                "Should be protected: {}.exe", name);
        }
    }

    #[test]
    fn test_classify_uninstaller() {
        let dir = std::env::temp_dir().join("mvo_test_classify");
        let _ = std::fs::create_dir_all(&dir);
        let exe = dir.join("Uninstall Game.exe");
        let _ = std::fs::write(&exe, b"MZ");
        assert_eq!(classify_executable(&exe), ExeClassification::Uninstaller);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_find_executables_empty_dir() {
        let dir = std::env::temp_dir().join("mvo_test_find_exe_empty");
        let _ = std::fs::create_dir_all(&dir);
        let results = find_executables_in_dir(&dir, 2);
        assert!(results.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_find_executables_finds_exe() {
        let dir = std::env::temp_dir().join("mvo_test_find_exe");
        let _ = std::fs::create_dir_all(&dir);
        let exe = dir.join("TestGame.exe");
        let _ = std::fs::write(&exe, b"MZ");
        let results = find_executables_in_dir(&dir, 2);
        assert_eq!(results.len(), 1);
        assert!(results[0].path.ends_with("TestGame.exe"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_score_executable_system() {
        let dir = std::env::temp_dir().join("mvo_test_score_sys");
        let _ = std::fs::create_dir_all(&dir);
        let exe = dir.join("chrome.exe");
        let _ = std::fs::write(&exe, b"MZ");
        let candidate = score_executable(&exe);
        assert!(candidate.score < 0);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
