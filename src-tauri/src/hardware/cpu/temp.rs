//! CPU temperature reader.
//!
//! Reads core/package temperatures written by the elevated
//! `cpu-temp.exe` helper (LibreHardwareMonitorLib) to a JSON file, with a
//! `sysinfo::Components` ACPI/chassis fallback when the helper is not running.
//!
//! The helper is launched by [`launch_helper_elevated`] (UAC prompt) only when
//! the user explicitly enables CPU temperature monitoring.

use serde::Deserialize;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// Helper JSON file location: %LOCALAPPDATA%\MVO Hub\cpu-temp.json
pub fn out_path() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("MVO Hub").join("cpu-temp.json"))
}

#[derive(Deserialize, Clone, Debug)]
pub struct TempEntry {
    pub name: String,
    pub value: f64,
}

#[derive(Deserialize)]
struct TempFile {
    ts: u64,
    temps: Vec<TempEntry>,
}

/// How old the helper file may be before we treat the helper as not running.
const STALE_SECS: u64 = 6;

/// Parse the helper JSON, returning entries only if the file is fresh.
pub fn parse_temps(json: &str, now_secs: u64) -> Vec<TempEntry> {
    let Ok(file) = serde_json::from_str::<TempFile>(json) else {
        return vec![];
    };
    if now_secs.saturating_sub(file.ts) > STALE_SECS {
        return vec![];
    }
    file.temps
}

/// Read the latest CPU temperatures from the helper JSON file.
pub fn read_cpu_temps() -> Vec<TempEntry> {
    let Some(path) = out_path() else {
        return vec![];
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return vec![];
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    parse_temps(&text, now)
}

/// Returns true if a fresh temperature file is present (helper running).
pub fn helper_running() -> bool {
    !read_cpu_temps().is_empty()
}

/// Returns true if the helper binary is installed next to the app executable.
pub fn helper_installed() -> bool {
    match std::env::current_exe() {
        Ok(exe) => {
            let helper = exe.with_file_name("cpu-temp.exe");
            helper.exists()
        }
        Err(_) => false,
    }
}

/// Triggers a UAC elevation prompt and launches the cpu-temp helper elevated.
/// Intended to be called only from an explicit user action ("Enable CPU temp").
pub fn launch_helper_elevated() -> std::io::Result<()> {
    let exe = match std::env::current_exe() {
        Ok(e) => e.with_file_name("cpu-temp.exe"),
        Err(e) => return Err(e),
    };
    if !exe.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "cpu-temp.exe not installed next to the application",
        ));
    }

    let out = out_path().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::NotFound, "cannot resolve app data dir")
    })?;

    // Escape single quotes for PowerShell single-quoted strings ('' is the escape).
    let q = |s: String| s.replace('\'', "''");
    let ps = format!(
        "Start-Process -FilePath '{}' -ArgumentList '\"{}\" {}' -Verb RunAs -WindowStyle Hidden",
        q(exe.display().to_string()),
        q(out.display().to_string()),
        std::process::id()
    );

    Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now_secs() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    #[test]
    fn parse_temps_returns_empty_for_malformed_json() {
        let now = now_secs();
        assert!(parse_temps("{ not json", now).is_empty());
        assert!(parse_temps("", now).is_empty());
        assert!(parse_temps("null", now).is_empty());
    }

    #[test]
    fn parse_temps_returns_empty_for_stale_file() {
        let now = now_secs();
        // File timestamp 30 seconds in the past -> stale.
        let json = format!("{{\"ts\": {}, \"temps\": [{{\"name\":\"Package\",\"value\":55.0}}]}}", now - 30);
        assert!(parse_temps(&json, now).is_empty());
    }

    #[test]
    fn parse_temps_returns_entries_for_fresh_file() {
        let now = now_secs();
        let json = format!(
            "{{\"ts\": {}, \"temps\": [{{\"name\":\"Package\",\"value\":55.0}},{{\"name\":\"Core 0\",\"value\":52.0}}]}}",
            now
        );
        let temps = parse_temps(&json, now);
        assert_eq!(temps.len(), 2);
        assert_eq!(temps[0].name, "Package");
        assert_eq!(temps[0].value, 55.0);
        assert_eq!(temps[1].name, "Core 0");
        assert_eq!(temps[1].value, 52.0);
    }

    #[test]
    fn parse_temps_boundary_is_fresh_at_6_seconds() {
        let now = now_secs();
        let json = format!("{{\"ts\": {}, \"temps\": [{{\"name\":\"Package\",\"value\":55.0}}]}}", now - 6);
        assert!(!parse_temps(&json, now).is_empty());
    }

    #[test]
    fn parse_temps_stale_at_7_seconds() {
        let now = now_secs();
        let json = format!("{{\"ts\": {}, \"temps\": [{{\"name\":\"Package\",\"value\":55.0}}]}}", now - 7);
        assert!(parse_temps(&json, now).is_empty());
    }
}
