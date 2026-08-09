use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use chrono::Local;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::Emitter;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateManifest {
    pub version: String,
    pub notes: String,
    pub pub_date: String,
    #[serde(default)]
    pub force: bool,
    pub platforms: HashMap<String, PlatformInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformInfo {
    pub url: String,
    #[serde(default)]
    pub file_size: u64,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub signature: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UpdateState {
    Idle,
    Checking,
    Available,
    Downloading,
    Verifying,
    Installing,
    Restarting,
    Completed,
    Error,
}

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

static UPDATE_STATE: OnceLock<Arc<Mutex<UpdateState>>> = OnceLock::new();
static DOWNLOAD_IN_PROGRESS: OnceLock<AtomicBool> = OnceLock::new();

fn get_state() -> &'static Arc<Mutex<UpdateState>> {
    UPDATE_STATE.get_or_init(|| Arc::new(Mutex::new(UpdateState::Idle)))
}

fn get_download_flag() -> &'static AtomicBool {
    DOWNLOAD_IN_PROGRESS.get_or_init(|| AtomicBool::new(false))
}

fn set_state(state: UpdateState) {
    let lock = get_state();
    let mut current = lock.lock().unwrap_or_else(|e| e.into_inner());
    *current = state;
}

#[allow(dead_code)]
pub fn current_state() -> UpdateState {
    let lock = get_state();
    let current = lock.lock().unwrap_or_else(|e| e.into_inner());
    *current
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

fn log_dir() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .to_string_lossy()
            .to_string()
    });
    PathBuf::from(local).join("MVO Hub").join("logs")
}

fn log_update(msg: &str) {
    let dir = log_dir();
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("updater.log");
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let line = format!("[{}] {}\n", timestamp, msg);
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut f| {
            use std::io::Write;
            f.write_all(line.as_bytes())
        });
}

// ---------------------------------------------------------------------------
// Version comparison
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq)]
struct ParsedVersion {
    major: u32,
    minor: u32,
    patch: u32,
    pre_release: Vec<PreReleasePart>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd)]
enum PreReleasePart {
    Numeric(u32),
    AlphaNumeric(String),
}

impl Ord for PreReleasePart {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        match (self, other) {
            (Self::Numeric(a), Self::Numeric(b)) => a.cmp(b),
            (Self::AlphaNumeric(a), Self::AlphaNumeric(b)) => a.cmp(b),
            (Self::Numeric(_), Self::AlphaNumeric(_)) => std::cmp::Ordering::Less,
            (Self::AlphaNumeric(_), Self::Numeric(_)) => std::cmp::Ordering::Greater,
        }
    }
}

/// Parse a version string into numeric components + optional pre-release.
/// Returns None if the string is empty or the leading numeric portion is malformed.
fn parse_version(v: &str) -> Option<ParsedVersion> {
    let v = v.trim();
    if v.is_empty() {
        return None;
    }

    let (numeric_part, pre_part) = match v.find(|c: char| c == '-' || c == '+') {
        Some(idx) => (&v[..idx], &v[idx..]),
        None => (v, ""),
    };

    let segments: Vec<&str> = numeric_part.split('.').collect();
    if segments.is_empty() {
        return None;
    }

    let parse_seg = |s: &str| -> Option<u32> { s.parse::<u32>().ok() };

    let major = parse_seg(segments[0])?;
    let minor = segments.get(1).and_then(|s| parse_seg(s)).unwrap_or(0);
    let patch = segments.get(2).and_then(|s| parse_seg(s)).unwrap_or(0);

    let mut pre_release = Vec::new();
    if pre_part.starts_with('-') {
        let tag = &pre_part[1..];
        for part in tag.split('.') {
            match part.parse::<u32>() {
                Ok(n) => pre_release.push(PreReleasePart::Numeric(n)),
                Err(_) => {
                    if !part.is_empty() {
                        pre_release.push(PreReleasePart::AlphaNumeric(part.to_lowercase()));
                    }
                }
            }
        }
    }

    Some(ParsedVersion {
        major,
        minor,
        patch,
        pre_release,
    })
}

/// Returns true when `remote` is strictly newer than `local`.
/// Treats malformed versions as "old" (returns true).
pub fn is_version_newer(local: &str, remote: &str) -> bool {
    let remote_parsed = match parse_version(remote) {
        Some(v) => v,
        None => return false,
    };
    let local_parsed = match parse_version(local) {
        Some(v) => v,
        None => return true,
    };

    let numeric_cmp = (remote_parsed.major, remote_parsed.minor, remote_parsed.patch)
        .cmp(&(local_parsed.major, local_parsed.minor, local_parsed.patch));

    match numeric_cmp {
        std::cmp::Ordering::Greater => true,
        std::cmp::Ordering::Less => false,
        std::cmp::Ordering::Equal => {
            // Same numeric version – pre-release tags are *older* than release
            if local_parsed.pre_release.is_empty() && remote_parsed.pre_release.is_empty() {
                return false;
            }
            if local_parsed.pre_release.is_empty() {
                return false; // remote has pre-release, local is release → not newer
            }
            if remote_parsed.pre_release.is_empty() {
                return true; // remote is release, local is pre-release → newer
            }
            remote_parsed.pre_release > local_parsed.pre_release
        }
    }
}

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

pub fn validate_manifest(manifest: &UpdateManifest) -> Result<(), String> {
    if manifest.version.is_empty() {
        return Err("Manifest version is empty".into());
    }

    if !manifest.version.bytes().all(|b| b.is_ascii_digit() || b == b'.' || b == b'-') {
        return Err(format!(
            "Manifest version '{}' contains invalid characters",
            manifest.version
        ));
    }

    let platforms = &manifest.platforms;
    if !platforms.contains_key("windows-x86_64") {
        return Err("Manifest missing 'windows-x86_64' platform".into());
    }

    let win = &platforms["windows-x86_64"];
    if win.url.is_empty() {
        return Err("Windows download URL is empty".into());
    }
    if !win.url.starts_with("https://") {
        return Err(format!(
            "Windows URL must use HTTPS, got: {}",
            &win.url[..win.url.len().min(60)]
        ));
    }

    if win.file_size > 0 && win.file_size < 1_048_576 {
        return Err(format!(
            "file_size {} is suspiciously small (<1MB)",
            win.file_size
        ));
    }

    if !win.sha256.is_empty() {
        if win.sha256.len() != 64 {
            return Err(format!(
                "SHA-256 hash must be 64 hex characters, got {}",
                win.sha256.len()
            ));
        }
        if !win.sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("SHA-256 hash contains non-hex characters".into());
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// SHA-256 verification
// ---------------------------------------------------------------------------

pub fn verify_sha256(file_path: &Path, expected_hash: &str) -> Result<bool, String> {
    let mut file = fs::File::open(file_path)
        .map_err(|e| format!("Failed to open file for hash verification: {}", e))?;

    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    use std::io::Read;

    loop {
        let n = file.read(&mut buf).map_err(|e| format!("Read error during hashing: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }

    let result = hasher.finalize();
    let computed = hex::encode(result);

    Ok(computed.eq_ignore_ascii_case(expected_hash))
}

// ---------------------------------------------------------------------------
// File integrity check
// ---------------------------------------------------------------------------

fn check_file_integrity(file_path: &Path, manifest: &PlatformInfo) -> Result<(), String> {
    let meta = fs::metadata(file_path).map_err(|e| format!("Cannot stat downloaded file: {}", e))?;
    let size = meta.len();

    if size < 1_048_576 {
        return Err(format!(
            "Downloaded file is too small ({} bytes, expected >=1MB)",
            size
        ));
    }

    if manifest.file_size > 0 && size != manifest.file_size {
        return Err(format!(
            "File size mismatch: expected {}, got {}",
            manifest.file_size, size
        ));
    }

    // Check MZ header (PE executable)
    let header = fs::read(file_path)
        .map_err(|e| format!("Failed to read file header: {}", e))?;
    if header.len() < 2 || header[0] != b'M' || header[1] != b'Z' {
        return Err("Downloaded file is not a valid PE executable (missing MZ header)".into());
    }

    // Verify SHA-256 if manifest provides one
    if !manifest.sha256.is_empty() {
        let hash_ok =
            verify_sha256(file_path, &manifest.sha256).map_err(|e| format!("Hash check error: {}", e))?;
        if !hash_ok {
            return Err("SHA-256 hash of downloaded file does not match manifest".into());
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

fn download_dir() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .to_string_lossy()
            .to_string()
    });
    PathBuf::from(local).join("MVO Hub")
}

async fn download_file(
    url: &str,
    dest: &Path,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("Download returned HTTP {}", status));
    }

    let total = resp.content_length().unwrap_or(0);

    let mut stream = resp.bytes_stream();
    let mut file = fs::File::create(dest)
        .map_err(|e| format!("Cannot create temp file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();
    let mut hasher = Sha256::new();

    while let Some(chunk) = stream.next().await {
        let data = chunk.map_err(|e| format!("Stream error: {}", e))?;
        use std::io::Write;
        file.write_all(&data)
            .map_err(|e| format!("Write error: {}", e))?;
        hasher.update(&data);
        downloaded += data.len() as u64;

        if last_emit.elapsed() >= Duration::from_millis(500) {
            let percent = if total > 0 {
                (downloaded as f64 / total as f64 * 100.0) as u32
            } else {
                0
            };
            let _ = app.emit(
                "update-progress",
                json!({
                    "status": "downloading",
                    "percent": percent,
                    "downloaded": downloaded,
                    "total": total,
                    "state": "downloading",
                }),
            );
            last_emit = Instant::now();
        }
    }

    file.sync_all()
        .map_err(|e| format!("Sync error: {}", e))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn check_for_updates() -> Result<String, String> {
    set_state(UpdateState::Checking);
    log_update("Checking for updates...");

    let settings = crate::load_settings().map_err(|e| format!("Failed to read settings: {}", e))?;

    let manifest_url = settings
        .get("update_url")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| {
            "https://raw.githubusercontent.com/YourOrg/MVO-Hub/main/update.json".to_string()
        });

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let resp = client
        .get(&manifest_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch manifest: {}", e))?;

    let manifest: UpdateManifest = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse manifest: {}", e))?;

    validate_manifest(&manifest)?;

    let current_version = env!("CARGO_PKG_VERSION");
    let remote_version = &manifest.version;

    log_update(&format!(
        "Current: {}, Remote: {}",
        current_version, remote_version
    ));

    if is_version_newer(current_version, remote_version) {
        set_state(UpdateState::Available);
        log_update(&format!("Update available: {}", remote_version));
        Ok(json!({
            "available": true,
            "version": remote_version,
            "notes": manifest.notes,
            "pub_date": manifest.pub_date,
            "force": manifest.force,
        })
        .to_string())
    } else {
        set_state(UpdateState::Idle);
        log_update("No update available");
        Ok(json!({
            "available": false,
            "version": current_version,
        })
        .to_string())
    }
}

#[tauri::command]
pub async fn download_and_install_update(app: tauri::AppHandle) -> Result<String, String> {
    let flag = get_download_flag();
    if flag.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("A download is already in progress".into());
    }

    let result = do_download_and_install(&app).await;
    flag.store(false, Ordering::SeqCst);
    result
}

async fn do_download_and_install(app: &tauri::AppHandle) -> Result<String, String> {
    set_state(UpdateState::Checking);
    log_update("Starting update download...");

    let settings = crate::load_settings().map_err(|e| format!("Failed to read settings: {}", e))?;

    let manifest_url = settings
        .get("update_url")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| {
            "https://raw.githubusercontent.com/YourOrg/MVO-Hub/main/update.json".to_string()
        });

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let resp = client
        .get(&manifest_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch manifest: {}", e))?;

    let manifest: UpdateManifest = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse manifest: {}", e))?;

    validate_manifest(&manifest)?;

    let current_version = env!("CARGO_PKG_VERSION");
    if !is_version_newer(current_version, &manifest.version) {
        set_state(UpdateState::Idle);
        return Ok(json!({"status": "no_update"}).to_string());
    }

    let platform = manifest
        .platforms
        .get("windows-x86_64")
        .ok_or_else(|| "No windows-x86_64 platform in manifest".to_string())?;

    let dir = download_dir();
    let _ = fs::create_dir_all(&dir);

    let final_name = format!("MVO_Hub_{}_setup.exe", manifest.version);
    let part_name = format!("{}.part", final_name);
    let part_path = dir.join(&part_name);
    let final_path = dir.join(&final_name);

    set_state(UpdateState::Downloading);
    log_update(&format!("Downloading {} from {}", final_name, &platform.url[..platform.url.len().min(80)]));

    let _ = app.emit(
        "update-progress",
        json!({
            "status": "downloading",
            "percent": 0u32,
            "downloaded": 0u64,
            "total": 0u64,
            "state": "downloading",
        }),
    );

    download_file(&platform.url, &part_path, app).await?;

    set_state(UpdateState::Verifying);
    log_update("Verifying downloaded file integrity...");

    let _ = app.emit(
        "update-progress",
        json!({
            "status": "verifying",
            "state": "verifying",
        }),
    );

    check_file_integrity(&part_path, platform)?;

    log_update("Integrity check passed");

    fs::rename(&part_path, &final_path)
        .map_err(|e| format!("Failed to rename .part file: {}", e))?;

    log_update(&format!("Update saved to {}", final_path.display()));

    set_state(UpdateState::Completed);
    let _ = app.emit(
        "update-progress",
        json!({
            "status": "completed",
            "percent": 100u32,
            "state": "completed",
            "path": final_path.to_string_lossy().to_string(),
        }),
    );

    // Launch installer
    set_state(UpdateState::Installing);
    log_update("Launching installer...");

    let _ = app.emit(
        "update-progress",
        json!({
            "status": "installing",
            "state": "installing",
        }),
    );

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", "/WAIT", &final_path.to_string_lossy()])
            .spawn();
    }

    set_state(UpdateState::Idle);
    log_update("Update process complete");

    Ok(json!({
        "status": "completed",
        "path": final_path.to_string_lossy().to_string(),
    })
    .to_string())
}

// ---------------------------------------------------------------------------
// Background check helper
// ---------------------------------------------------------------------------

pub fn should_auto_check() -> bool {
    match crate::load_settings() {
        Ok(settings) => settings
            .get("auto_update")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        Err(_) => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- Version comparison tests ----

    #[test]
    fn patch_increment() {
        assert!(is_version_newer("0.2.11", "0.2.12"));
        assert!(!is_version_newer("0.2.12", "0.2.11"));
    }

    #[test]
    fn same_version() {
        assert!(!is_version_newer("0.2.12", "0.2.12"));
    }

    #[test]
    fn minor_increment() {
        assert!(is_version_newer("0.2.12", "0.3.0"));
        assert!(!is_version_newer("0.3.0", "0.2.12"));
    }

    #[test]
    fn major_increment() {
        assert!(is_version_newer("0.9.99", "1.0.0"));
        assert!(!is_version_newer("1.0.0", "0.9.99"));
    }

    #[test]
    fn missing_patch_treated_as_zero() {
        assert!(!is_version_newer("0.2", "0.2.0"));
        assert!(!is_version_newer("0.2.0", "0.2"));
    }

    #[test]
    fn pre_release_is_older() {
        assert!(is_version_newer("0.2.0-beta", "0.2.0"));
        assert!(is_version_newer("0.2.0-rc.1", "0.2.0"));
        assert!(!is_version_newer("0.2.0", "0.2.0-beta"));
    }

    #[test]
    fn pre_release_comparison() {
        assert!(is_version_newer("0.2.0-alpha", "0.2.0-beta"));
        assert!(is_version_newer("0.2.0-alpha.1", "0.2.0-alpha.2"));
        assert!(!is_version_newer("0.2.0-beta", "0.2.0-alpha"));
    }

    #[test]
    fn malformed_versions() {
        assert!(is_version_newer("", "0.2.12"));
        assert!(is_version_newer("abc", "0.2.12"));
        assert!(!is_version_newer("0.2.12", ""));
    }

    #[test]
    fn empty_remote_is_not_newer() {
        assert!(!is_version_newer("0.2.12", ""));
    }

    #[test]
    fn major_minor_only() {
        assert!(is_version_newer("1.0", "2.0"));
        assert!(!is_version_newer("2.0", "1.0"));
    }

    #[test]
    fn large_version_numbers() {
        assert!(is_version_newer("99.99.99", "100.0.0"));
        assert!(!is_version_newer("100.0.0", "99.99.99"));
    }

    #[test]
    fn three_digit_patch() {
        assert!(is_version_newer("1.2.100", "1.2.101"));
        assert!(!is_version_newer("1.2.101", "1.2.100"));
    }

    // ---- Manifest validation tests ----

    #[test]
    fn valid_manifest() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "windows-x86_64".into(),
            PlatformInfo {
                url: "https://example.com/setup.exe".into(),
                file_size: 5_000_000,
                sha256: "a".repeat(64),
                signature: String::new(),
            },
        );
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: "notes".into(),
            pub_date: "2025-01-01".into(),
            force: false,
            platforms,
        };
        assert!(validate_manifest(&m).is_ok());
    }

    #[test]
    fn empty_version() {
        let m = UpdateManifest {
            version: String::new(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms: HashMap::new(),
        };
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn invalid_version_chars() {
        let m = UpdateManifest {
            version: "1.0.0-beta+build".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms: HashMap::new(),
        };
        let err = validate_manifest(&m).unwrap_err();
        assert!(err.contains("invalid characters"));
    }

    #[test]
    fn missing_windows_platform() {
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms: HashMap::new(),
        };
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn empty_url() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "windows-x86_64".into(),
            PlatformInfo {
                url: String::new(),
                file_size: 0,
                sha256: String::new(),
                signature: String::new(),
            },
        );
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms,
        };
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn non_https_url() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "windows-x86_64".into(),
            PlatformInfo {
                url: "http://example.com/setup.exe".into(),
                file_size: 0,
                sha256: String::new(),
                signature: String::new(),
            },
        );
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms,
        };
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn small_file_size() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "windows-x86_64".into(),
            PlatformInfo {
                url: "https://example.com/setup.exe".into(),
                file_size: 500,
                sha256: String::new(),
                signature: String::new(),
            },
        );
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms,
        };
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn bad_sha256_length() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "windows-x86_64".into(),
            PlatformInfo {
                url: "https://example.com/setup.exe".into(),
                file_size: 5_000_000,
                sha256: "abc123".into(),
                signature: String::new(),
            },
        );
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms,
        };
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn bad_sha256_hex() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "windows-x86_64".into(),
            PlatformInfo {
                url: "https://example.com/setup.exe".into(),
                file_size: 5_000_000,
                sha256: "z".repeat(64),
                signature: String::new(),
            },
        );
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms,
        };
        assert!(validate_manifest(&m).is_err());
    }

    // ---- SHA-256 verification tests ----

    #[test]
    fn hash_correct() {
        use std::io::Write;
        let dir = std::env::temp_dir().join("mvo_updater_test_correct");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.bin");
        let mut f = fs::File::create(&path).unwrap();
        f.write_all(b"hello world").unwrap();
        drop(f);

        // SHA-256 of "hello world"
        let expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
        assert!(verify_sha256(&path, expected).unwrap());
        assert!(!verify_sha256(&path, "0000000000000000000000000000000000000000000000000000000000000000").unwrap());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn hash_incorrect() {
        use std::io::Write;
        let dir = std::env::temp_dir().join("mvo_updater_test_incorrect");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.bin");
        let mut f = fs::File::create(&path).unwrap();
        f.write_all(b"goodbye world").unwrap();
        drop(f);

        let expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
        assert!(!verify_sha256(&path, expected).unwrap());
        let _ = fs::remove_dir_all(&dir);
    }

    // ---- State transition tests ----

    #[test]
    fn state_idle_to_checking() {
        set_state(UpdateState::Idle);
        assert_eq!(current_state(), UpdateState::Idle);
        set_state(UpdateState::Checking);
        assert_eq!(current_state(), UpdateState::Checking);
    }

    #[test]
    fn state_checking_to_available() {
        set_state(UpdateState::Checking);
        set_state(UpdateState::Available);
        assert_eq!(current_state(), UpdateState::Available);
    }

    #[test]
    fn state_downloading_to_verifying() {
        set_state(UpdateState::Downloading);
        set_state(UpdateState::Verifying);
        assert_eq!(current_state(), UpdateState::Verifying);
    }

    #[test]
    fn state_full_lifecycle() {
        let states = [
            UpdateState::Idle,
            UpdateState::Checking,
            UpdateState::Available,
            UpdateState::Downloading,
            UpdateState::Verifying,
            UpdateState::Installing,
            UpdateState::Completed,
        ];
        for s in &states {
            set_state(*s);
            assert_eq!(current_state(), *s);
        }
    }

    #[test]
    fn state_error_from_any() {
        set_state(UpdateState::Downloading);
        set_state(UpdateState::Error);
        assert_eq!(current_state(), UpdateState::Error);
    }

    // ---- Parse version edge cases ----

    #[test]
    fn parse_version_valid() {
        let v = parse_version("1.2.3").unwrap();
        assert_eq!(v.major, 1);
        assert_eq!(v.minor, 2);
        assert_eq!(v.patch, 3);
        assert!(v.pre_release.is_empty());
    }

    #[test]
    fn parse_version_two_segments() {
        let v = parse_version("1.2").unwrap();
        assert_eq!(v.major, 1);
        assert_eq!(v.minor, 2);
        assert_eq!(v.patch, 0);
    }

    #[test]
    fn parse_version_pre_release() {
        let v = parse_version("1.0.0-beta.1").unwrap();
        assert_eq!(v.pre_release.len(), 2);
    }

    #[test]
    fn parse_version_empty() {
        assert!(parse_version("").is_none());
    }

    #[test]
    fn parse_version_non_numeric() {
        assert!(parse_version("abc.def.ghi").is_none());
    }

    // ---- Additional version comparison tests ----

    #[test]
    fn test_version_newer_patch() {
        assert!(is_version_newer("0.2.11", "0.2.12"));
    }

    #[test]
    fn test_version_newer_minor() {
        assert!(is_version_newer("0.2.12", "0.3.0"));
    }

    #[test]
    fn test_version_newer_major() {
        assert!(is_version_newer("0.9.99", "1.0.0"));
    }

    #[test]
    fn test_version_same() {
        assert!(!is_version_newer("0.2.12", "0.2.12"));
    }

    #[test]
    fn test_version_older_remote() {
        assert!(!is_version_newer("0.2.13", "0.2.12"));
    }

    #[test]
    fn test_version_missing_segment() {
        assert!(is_version_newer("0.2", "0.2.1"));
    }

    #[test]
    fn test_version_empty_local() {
        assert!(is_version_newer("", "0.2.12"));
    }

    #[test]
    fn test_version_empty_remote() {
        assert!(!is_version_newer("0.2.12", ""));
    }

    #[test]
    fn test_version_both_empty() {
        assert!(!is_version_newer("", ""));
    }

    #[test]
    fn test_version_malformed_local() {
        assert!(is_version_newer("abc", "0.2.12"));
    }

    #[test]
    fn test_version_malformed_remote() {
        assert!(!is_version_newer("0.2.12", "xyz"));
    }

    // ---- Additional manifest validation tests ----

    #[test]
    fn test_valid_manifest() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "windows-x86_64".into(),
            PlatformInfo {
                url: "https://example.com/setup.exe".into(),
                file_size: 5_000_000,
                sha256: "a".repeat(64),
                signature: String::new(),
            },
        );
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: "notes".into(),
            pub_date: "2025-01-01".into(),
            force: false,
            platforms,
        };
        assert!(validate_manifest(&m).is_ok());
    }

    #[test]
    fn test_missing_version() {
        let m = UpdateManifest {
            version: "".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms: HashMap::new(),
        };
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn test_missing_platform() {
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms: HashMap::new(),
        };
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn test_invalid_url_http() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "windows-x86_64".into(),
            PlatformInfo {
                url: "http://example.com/setup.exe".into(),
                file_size: 5_000_000,
                sha256: String::new(),
                signature: String::new(),
            },
        );
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms,
        };
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn test_empty_url() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "windows-x86_64".into(),
            PlatformInfo {
                url: "".into(),
                file_size: 5_000_000,
                sha256: String::new(),
                signature: String::new(),
            },
        );
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms,
        };
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn test_bad_sha256_length() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "windows-x86_64".into(),
            PlatformInfo {
                url: "https://example.com/setup.exe".into(),
                file_size: 5_000_000,
                sha256: "abc123".into(),
                signature: String::new(),
            },
        );
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms,
        };
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn test_bad_sha256_chars() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "windows-x86_64".into(),
            PlatformInfo {
                url: "https://example.com/setup.exe".into(),
                file_size: 5_000_000,
                sha256: "z".repeat(64),
                signature: String::new(),
            },
        );
        let m = UpdateManifest {
            version: "1.0.0".into(),
            notes: String::new(),
            pub_date: String::new(),
            force: false,
            platforms,
        };
        assert!(validate_manifest(&m).is_err());
    }

    // ---- Additional SHA-256 tests ----

    #[test]
    fn test_sha256_correct_hash() {
        use std::io::Write;
        let dir = std::env::temp_dir().join("mvo_updater_test_correct_hash");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.bin");
        let mut f = fs::File::create(&path).unwrap();
        f.write_all(b"hello world").unwrap();
        drop(f);

        let expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
        assert!(verify_sha256(&path, expected).unwrap());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_sha256_incorrect_hash() {
        use std::io::Write;
        let dir = std::env::temp_dir().join("mvo_updater_test_incorrect_hash");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.bin");
        let mut f = fs::File::create(&path).unwrap();
        f.write_all(b"goodbye world").unwrap();
        drop(f);

        let expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
        assert!(!verify_sha256(&path, expected).unwrap());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_sha256_empty_file() {
        use std::io::Write;
        let dir = std::env::temp_dir().join("mvo_updater_test_empty_file");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("empty.bin");
        let mut f = fs::File::create(&path).unwrap();
        f.write_all(b"").unwrap();
        drop(f);

        // SHA-256 of empty string
        let expected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        assert!(verify_sha256(&path, expected).unwrap());
        let _ = fs::remove_dir_all(&dir);
    }

    // ---- Additional state machine tests ----

    #[test]
    fn test_initial_state_is_idle() {
        set_state(UpdateState::Idle);
        assert_eq!(current_state(), UpdateState::Idle);
    }

    #[test]
    fn test_state_transitions() {
        let states = [
            UpdateState::Idle,
            UpdateState::Checking,
            UpdateState::Available,
            UpdateState::Downloading,
            UpdateState::Verifying,
            UpdateState::Installing,
        ];
        for s in &states {
            set_state(*s);
            assert_eq!(current_state(), *s);
        }
    }
}
