pub mod engine;
pub mod steam;
pub mod epic;
pub mod gog;
pub mod ea;
pub mod ubisoft;
pub mod battlenet;
pub mod riot;
pub mod xbox;
pub mod amazon;
pub mod itch;
pub mod rockstar;
pub mod minecraft;
pub mod emulator;
pub mod standalone;

#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Unified game representation from any scanner
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedGame {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub launcher: String,
    pub install_path: String,
    pub exe_path: Option<String>,
    pub app_id: Option<String>,
    pub version: Option<String>,
    pub icon_path: Option<String>,
    pub cover_path: Option<String>,
    pub banner_path: Option<String>,
    pub install_size: Option<u64>,
    pub scan_confidence: f32,
    pub is_installed: bool,
}

/// Trait that all platform scanners must implement
pub trait GameScanner: Send + Sync {
    /// Platform name (e.g., "Steam", "Epic", "GOG")
    fn platform(&self) -> &str;

    /// Check if this scanner can run (is the launcher installed?)
    fn is_available(&self) -> bool;

    /// Scan for installed games
    fn scan(&self) -> Vec<ScannedGame>;

    /// Priority for deduplication (higher = preferred source)
    fn priority(&self) -> u32 {
        50
    }
}

/// Helper to calculate folder size
pub fn calculate_folder_size(path: &PathBuf) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                total += calculate_folder_size(&entry_path);
            } else if let Ok(meta) = std::fs::metadata(&entry_path) {
                total += meta.len();
            }
        }
    }
    total
}

/// Helper to find exe in a directory (non-recursive, max 2 levels)
pub fn find_exe_in_dir_deep(dir: &PathBuf, max_depth: u32) -> Option<PathBuf> {
    if max_depth == 0 {
        return None;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(exe) = find_exe_in_dir_deep(&path, max_depth - 1) {
                    return Some(exe);
                }
            } else if path.extension().and_then(|e| e.to_str()) == Some("exe") {
                let name = path.file_stem().and_then(|n| n.to_str()).unwrap_or("");
                let lower = name.to_lowercase();
                // Skip common non-game executables
                if !lower.contains("uninstall")
                    && !lower.contains("setup")
                    && !lower.contains("install")
                    && !lower.contains("update")
                    && !lower.contains("launcher")
                    && !lower.contains("helper")
                    && !lower.contains("service")
                {
                    return Some(path);
                }
            }
        }
    }
    None
}

/// Check if a path looks like a game directory
pub fn is_game_dir_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    // Skip common non-game directories
    !lower.starts_with(".")
        && !lower.starts_with("__")
        && !lower.contains("redist")
        && !lower.contains("redistributable")
        && !lower.contains("support")
        && !lower.contains("docs")
        && !lower.contains("manual")
        && !lower.contains("sdk")
        && !lower.contains("tools")
        && !lower.contains("uninstall")
        && !lower.contains("target")
        && !lower.contains("node_modules")
        && !lower.contains("steamcmd")
        && !lower.contains("steam")
        && lower != "games"
        && lower != "common"
        && lower.len() > 2
}
