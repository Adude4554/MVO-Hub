use crate::scanner::confidence::{ConfidenceReason, ConfidenceScore};
use crate::scanner::executable;
use crate::scanner::ScannedGame;
use std::path::{Path, PathBuf};

pub struct ShortcutScanner;

impl ShortcutScanner {
    pub fn new() -> Self { Self }

    pub fn scan(&self) -> Vec<ScannedGame> {
        let mut games = Vec::new();
        let locations = self.get_shortcut_locations();

        for loc in locations {
            if !loc.exists() { continue; }
            self.scan_shortcut_dir(&loc, &mut games);
        }

        games
    }

    fn get_shortcut_locations(&self) -> Vec<PathBuf> {
        let mut locations = Vec::new();
        let home = dirs::home_dir().unwrap_or_default();

        locations.push(home.join("Desktop"));
        locations.push(home.join("OneDrive").join("Desktop"));

        let app_data = dirs::data_dir().unwrap_or_default();
        locations.push(app_data.join("Microsoft").join("Windows").join("Start Menu").join("Programs"));
        locations.push(PathBuf::from("C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs"));

        if let Some(local) = dirs::data_local_dir() {
            locations.push(local.join("Programs"));
        }

        locations
    }

    fn scan_shortcut_dir(&self, dir: &Path, games: &mut Vec<ScannedGame>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return; };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                self.scan_shortcut_dir(&path, games);
                continue;
            }

            if path.extension().and_then(|e| e.to_str()) != Some("lnk") { continue; }

            if let Some(game) = self.parse_shortcut(&path) {
                games.push(game);
            }
        }
    }

    fn parse_shortcut(&self, lnk_path: &Path) -> Option<ScannedGame> {
        let target = resolve_lnk_target(lnk_path)?;
        let target_path = Path::new(&target);

        if !target_path.exists() { return None; }
        if !target_path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("exe")).unwrap_or(false) {
            return None;
        }

        if super::filter::is_protected_executable(target_path.file_name()?.to_str()?) {
            return None;
        }

        let display_name = lnk_path.file_stem()?.to_str()?.to_string();

        let mut confidence = ConfidenceScore::new();
        confidence.add(ConfidenceReason::ShortcutTarget);

        let exe_name = target_path.file_name()?.to_str()?.to_string();
        if !super::filter::is_likely_utility(&exe_name) {
            confidence.add(ConfidenceReason::ExecutableMetadata);
        }

        let metadata = executable::analyze_executable(target_path);
        if let Some(ref meta) = metadata {
            if let Some(ref company) = meta.company_name {
                if !company.is_empty() {
                    confidence.add(ConfidenceReason::KnownPublisher);
                }
            }
        }

        let install_dir = target_path.parent().map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("C:\\"));

        Some(ScannedGame {
            id: format!("shortcut:{}", lnk_path.to_string_lossy().to_lowercase().replace('\\', "/")),
            name: display_name,
            platform: "Shortcut".to_string(),
            launcher: "Shortcut".to_string(),
            install_path: install_dir.to_string_lossy().to_string(),
            exe_path: Some(target),
            app_id: None,
            version: metadata.as_ref().and_then(|m| m.product_version.clone()),
            icon_path: None,
            cover_path: None,
            banner_path: None,
            install_size: None,
            scan_confidence: (confidence.score / 100.0).min(1.0),
            is_installed: true,
        })
    }
}

fn resolve_lnk_target(lnk_path: &Path) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;

        let ps_script = format!(
            "$s = New-Object -ComObject WScript.Shell; $lnk = $s.CreateShortcut('{}'); Write-Output $lnk.TargetPath",
            lnk_path.display().to_string().replace('\'', "''")
        );

        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_script])
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shortcut_scanner_not_empty() {
        let scanner = ShortcutScanner::new();
        let locations = scanner.get_shortcut_locations();
        assert!(!locations.is_empty());
    }

    #[test]
    fn test_resolve_lnk_nonexistent() {
        let result = resolve_lnk_target(Path::new("C:\\nonexistent.lnk"));
        assert!(result.is_none());
    }
}
