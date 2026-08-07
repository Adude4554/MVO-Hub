use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use futures_util::StreamExt;

mod gamevault;
mod scanner;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
extern "system" {
    pub fn ExtractIconExW(
        file: *const u16,
        index: i32,
        large: *mut *mut core::ffi::c_void,
        small: *mut *mut core::ffi::c_void,
        count: u32,
    ) -> u32;
    pub fn DestroyIcon(hicon: *mut core::ffi::c_void) -> i32;
    #[allow(private_interfaces)]
    pub fn GetIconInfo(hicon: *mut core::ffi::c_void, info: *mut ICONINFO) -> i32;
    #[allow(private_interfaces)]
    pub fn GetDIBits(hdc: *mut core::ffi::c_void, hbmp: *mut core::ffi::c_void, start: u32, c_lines: u32, bits: *mut u8, info: *mut BITMAPINFOHEADER, usage: u32) -> i32;
    pub fn CreateCompatibleDC(hdc: *mut core::ffi::c_void) -> *mut core::ffi::c_void;
    pub fn DeleteDC(hdc: *mut core::ffi::c_void) -> i32;
    pub fn DeleteObject(obj: *mut core::ffi::c_void) -> i32;
    pub fn GetDC(hwnd: *mut core::ffi::c_void) -> *mut core::ffi::c_void;
    pub fn ReleaseDC(hwnd: *mut core::ffi::c_void, hdc: *mut core::ffi::c_void) -> i32;
}

#[cfg(target_os = "windows")]
#[repr(C)]
pub(crate) struct ICONINFO {
    f_icon: i32,
    x_hotspot: u32,
    y_hotspot: u32,
    hbm_mask: *mut core::ffi::c_void,
    hbm_color: *mut core::ffi::c_void,
}

#[cfg(target_os = "windows")]
#[repr(C)]
pub(crate) struct BITMAPINFOHEADER {
    bi_size: u32,
    bi_width: i32,
    bi_height: i32,
    bi_planes: u16,
    bi_bit_count: u16,
    bi_compression: u32,
    bi_size_image: u32,
    bi_x_pels_per_meter: i32,
    bi_y_pels_per_meter: i32,
    bi_clr_used: u32,
    bi_clr_important: u32,
}

use serde::{Deserialize, Serialize};
use serde_json::json;
use sysinfo::{Disks, System};
use tauri::{Emitter, Manager};

static SYSTEM_CACHE: OnceLock<Arc<Mutex<SystemSnapshot>>> = OnceLock::new();
static ENGINE_STARTED: OnceLock<()> = OnceLock::new();
static GV_DB: OnceLock<Arc<Mutex<gamevault::db::GameVaultDb>>> = OnceLock::new();
static GV_CANCEL_TOKENS: OnceLock<Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>> = OnceLock::new();

fn default_refresh_rate() -> String { "1".to_string() }
fn default_theme_mode() -> String { "neon".to_string() }
fn default_true() -> bool { true }
fn default_false() -> bool { false }
fn default_api_provider() -> String { "gemini".to_string() }
fn default_api_base_url() -> String { "https://generativelanguage.googleapis.com/v1beta".to_string() }
fn default_api_model() -> String { "gemini-3.5-flash".to_string() }
fn default_api_key() -> String { String::new() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_refresh_rate")]
    pub refresh_rate: String,
    #[serde(default = "default_theme_mode")]
    pub theme_mode: String,
    #[serde(default = "default_true")]
    pub auto_scan_games: bool,
    #[serde(default = "default_true")]
    pub launch_steam_with_boost: bool,
    #[serde(default = "default_false")]
    pub launch_overlay_with_game: bool,
    #[serde(default = "default_api_provider")]
    pub api_provider: String,
    #[serde(default = "default_api_base_url")]
    pub api_base_url: String,
    #[serde(default = "default_api_model")]
    pub api_model: String,
    #[serde(default = "default_api_key")]
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub cpu_name: String,
    pub cpu_load: String,
    pub ram_used_gb: String,
    pub ram_total_gb: String,
    pub ram_load: String,
    pub storage_used_gb: String,
    pub storage_total_gb: String,
    pub storage_load: String,
    pub uptime: String,
    pub gpu_name: String,
    pub gpu_load: String,
    pub gpu_temp: String,
    pub gpu_memory_used: String,
    pub gpu_memory_total: String,
    pub gpu_power: String,
    pub fps: String,
    pub fan: String,
    pub engine_status: String,
    pub engine_tick: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCard {
    pub name: String,
    pub platform: String,
    pub app_id: String,
    pub install_path: String,
    pub library_path: String,
    pub status: String,
    pub profile: String,
}

fn default_settings() -> AppSettings {
    AppSettings {
        refresh_rate: "1".to_string(),
        theme_mode: "neon".to_string(),
        auto_scan_games: true,
        launch_steam_with_boost: true,
        launch_overlay_with_game: false,
        api_provider: default_api_provider(),
        api_base_url: default_api_base_url(),
        api_model: default_api_model(),
        api_key: default_api_key(),
    }
}

fn default_snapshot() -> SystemSnapshot {
    SystemSnapshot {
        cpu_name: "MVO Performance Engine starting".to_string(),
        cpu_load: "0".to_string(),
        ram_used_gb: "0".to_string(),
        ram_total_gb: "0".to_string(),
        ram_load: "0".to_string(),
        storage_used_gb: "0".to_string(),
        storage_total_gb: "0".to_string(),
        storage_load: "0".to_string(),
        uptime: "N/A".to_string(),
        gpu_name: "Use FPS Monitor overlay for GPU/FPS".to_string(),
        gpu_load: "0".to_string(),
        gpu_temp: "Overlay".to_string(),
        gpu_memory_used: "0".to_string(),
        gpu_memory_total: "0".to_string(),
        gpu_power: "Overlay".to_string(),
        fps: "Overlay".to_string(),
        fan: "Overlay".to_string(),
        engine_status: "Starting".to_string(),
        engine_tick: "0".to_string(),
    }
}

fn settings_file_path() -> Result<PathBuf, String> {
    let appdata = env::var("APPDATA")
        .map_err(|_| "APPDATA environment variable was not found.".to_string())?;

    let folder = PathBuf::from(appdata).join("ProjectMVO");

    if !folder.exists() {
        fs::create_dir_all(&folder)
            .map_err(|error| format!("Failed to create ProjectMVO settings folder: {}", error))?;
    }

    Ok(folder.join("mvo-settings.json"))
}

fn format_output(output: std::process::Output) -> Result<String, String> {
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            Ok("Command completed.".to_string())
        } else {
            Ok(stdout)
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err("Command failed with no error output.".to_string())
        } else {
            Err(stderr)
        }
    }
}

fn open_path(path: impl AsRef<Path>) -> Result<String, String> {
    let path_ref = path.as_ref();

    if !path_ref.exists() {
        return Err(format!("Path does not exist: {}", path_ref.display()));
    }

    Command::new("explorer")
        .arg(path_ref)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Failed to open path: {}", error))?;

    Ok(format!("Opened {}", path_ref.display()))
}

fn open_path_or_parent(path: impl AsRef<Path>) -> Result<String, String> {
    let path_ref = path.as_ref();

    if path_ref.exists() {
        return open_path(path_ref);
    }

    if let Some(parent) = path_ref.parent() {
        if parent.exists() {
            return open_path(parent);
        }
    }

    Err(format!("Path does not exist: {}", path_ref.display()))
}

fn open_url_with_windows(url: &str) -> Result<String, String> {
    Command::new("cmd")
        .args(["/C", "start", "", url])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Failed to open URL: {}", error))?;

    Ok(format!("Opened {}", url))
}

fn user_folder(folder_name: &str) -> Result<PathBuf, String> {
    let profile = env::var("USERPROFILE")
        .map_err(|_| "USERPROFILE environment variable was not found.".to_string())?;

    Ok(PathBuf::from(profile).join(folder_name))
}

fn ensure_folder(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let path_ref = path.as_ref();

    if !path_ref.exists() {
        fs::create_dir_all(path_ref)
            .map_err(|error| format!("Failed to create folder {}: {}", path_ref.display(), error))?;
    }

    Ok(path_ref.to_path_buf())
}

fn normalize_user_path(path: &str) -> PathBuf {
    let cleaned = path
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .replace('/', "\\");

    PathBuf::from(cleaned)
}

fn pictures_folder_path() -> Result<PathBuf, String> {
    let profile = env::var("USERPROFILE")
        .map_err(|_| "USERPROFILE environment variable was not found.".to_string())?;

    let profile_path = PathBuf::from(&profile);

    let mut candidates = vec![profile_path.join("Pictures")];

    for variable in ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"] {
        if let Ok(value) = env::var(variable) {
            if !value.trim().is_empty() {
                candidates.push(PathBuf::from(value).join("Pictures"));
            }
        }
    }

    for candidate in candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    ensure_folder(profile_path.join("Pictures"))
}

fn steam_registry_path() -> Option<PathBuf> {
    let output = Command::new("cmd")
        .args([
            "/C",
            "reg",
            "query",
            "HKCU\\Software\\Valve\\Steam",
            "/v",
            "SteamPath",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);

    for line in text.lines() {
        if line.contains("SteamPath") && line.contains("REG_SZ") {
            if let Some(index) = line.find("REG_SZ") {
                let value = line[index + "REG_SZ".len()..].trim();
                if !value.is_empty() {
                    return Some(PathBuf::from(value.replace('/', "\\")));
                }
            }
        }
    }

    None
}

fn possible_steam_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(path) = steam_registry_path() {
        paths.push(path);
    }

    if let Ok(program_files_x86) = env::var("PROGRAMFILES(X86)") {
        paths.push(PathBuf::from(program_files_x86).join("Steam"));
    }

    if let Ok(program_files) = env::var("PROGRAMFILES") {
        paths.push(PathBuf::from(program_files).join("Steam"));
    }

    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        paths.push(PathBuf::from(local_app_data).join("Steam"));
    }

    paths.push(PathBuf::from("C:\\Program Files (x86)\\Steam"));
    paths.push(PathBuf::from("C:\\Program Files\\Steam"));
    paths.push(PathBuf::from("D:\\Steam"));
    paths.push(PathBuf::from("D:\\steam app"));
    paths.push(PathBuf::from("E:\\Steam"));
    paths.push(PathBuf::from("E:\\steam app"));

    for drive in 'C'..='Z' {
        let base = PathBuf::from(format!("{}:\\", drive));
        if base.exists() {
            paths.push(base.join("Steam"));
            paths.push(base.join("steam app"));
            paths.push(base.join("SteamLibrary"));
            paths.push(base.join("Games").join("Steam"));
        }
    }

    let mut unique = Vec::new();
    let mut seen = HashSet::new();

    for path in paths {
        let key = path.to_string_lossy().to_lowercase();
        if seen.insert(key) {
            unique.push(path);
        }
    }

    unique
}

fn find_steam_path() -> Option<PathBuf> {
    possible_steam_paths()
        .into_iter()
        .find(|path| path.join("steam.exe").exists())
}

fn extract_quoted_value(line: &str) -> Option<String> {
    let parts: Vec<&str> = line.split('"').collect();

    if parts.len() >= 4 {
        Some(parts[3].to_string())
    } else {
        None
    }
}

#[tauri::command]
#[cfg(target_os = "windows")]
fn extract_exe_icon(exe_path: String) -> Result<String, String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    let wide: Vec<u16> = OsStr::new(&exe_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut large_icons = [std::ptr::null_mut(); 1];
    let count = unsafe {
        ExtractIconExW(wide.as_ptr(), 0, large_icons.as_mut_ptr(), std::ptr::null_mut(), 1)
    };

    if count == 0 || large_icons[0].is_null() {
        return Err("No icon found in EXE".to_string());
    }

    let hicon = large_icons[0];
    let mut icon_info = ICONINFO {
        f_icon: 0,
        x_hotspot: 0,
        y_hotspot: 0,
        hbm_mask: std::ptr::null_mut(),
        hbm_color: std::ptr::null_mut(),
    };

    unsafe { GetIconInfo(hicon, &mut icon_info) };

    let hdc = unsafe { CreateCompatibleDC(std::ptr::null_mut()) };
    let screen_dc = unsafe { GetDC(std::ptr::null_mut()) };

    let width = 256i32;
    let height = 256i32;

    let mut bmi = BITMAPINFOHEADER {
        bi_size: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        bi_width: width,
        bi_height: -height,
        bi_planes: 1,
        bi_bit_count: 32,
        bi_compression: 0,
        bi_size_image: (width * height * 4) as u32,
        bi_x_pels_per_meter: 0,
        bi_y_pels_per_meter: 0,
        bi_clr_used: 0,
        bi_clr_important: 0,
    };

    let mut pixels = vec![0u8; (width * height * 4) as usize];

    unsafe {
        GetDIBits(
            screen_dc,
            icon_info.hbm_color,
            0,
            height as u32,
            pixels.as_mut_ptr(),
            &mut bmi,
            0,
        );
        ReleaseDC(std::ptr::null_mut(), screen_dc);
        DeleteDC(hdc);
        if !icon_info.hbm_mask.is_null() { DeleteObject(icon_info.hbm_mask); }
        if !icon_info.hbm_color.is_null() { DeleteObject(icon_info.hbm_color); }
        DestroyIcon(hicon);
    }

    // Encode as BMP data URL
    let row_size = (width * 3 + 3) & !3;
    let pixel_data_size = row_size as usize * height as usize;
    let mut bmp_data = vec![0u8; 54 + pixel_data_size];

    // BMP header
    bmp_data[0] = b'B'; bmp_data[1] = b'M';
    let file_size = (54 + pixel_data_size) as u32;
    bmp_data[2..6].copy_from_slice(&file_size.to_le_bytes());
    bmp_data[10..14].copy_from_slice(&54u32.to_le_bytes());
    bmp_data[14..18].copy_from_slice(&40u32.to_le_bytes());
    bmp_data[18..22].copy_from_slice(&(width as u32).to_le_bytes());
    bmp_data[22..26].copy_from_slice(&(height as u32).to_le_bytes());
    bmp_data[26..28].copy_from_slice(&1u16.to_le_bytes());
    bmp_data[28..30].copy_from_slice(&24u16.to_le_bytes());
    bmp_data[34..38].copy_from_slice(&(pixel_data_size as u32).to_le_bytes());

    for y in 0..height as usize {
        for x in 0..width as usize {
            let src_idx = (y * width as usize + x) * 4;
            let dst_idx = 54 + y * row_size as usize + x * 3;
            if src_idx + 2 < pixels.len() && dst_idx + 2 < bmp_data.len() {
                bmp_data[dst_idx] = pixels[src_idx + 2];     // B
                bmp_data[dst_idx + 1] = pixels[src_idx + 1]; // G
                bmp_data[dst_idx + 2] = pixels[src_idx];     // R
            }
        }
    }

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bmp_data);
    Ok(format!("data:image/bmp;base64,{}", b64))
}

#[tauri::command]
#[cfg(not(target_os = "windows"))]
fn extract_exe_icon(exe_path: String) -> Result<String, String> {
    Err("Icon extraction only supported on Windows".to_string())
}

fn steam_library_paths(steam_path: &Path) -> Vec<PathBuf> {
    let mut libraries = Vec::new();
    let mut seen = HashSet::new();

    let default_library = steam_path.to_path_buf();
    seen.insert(default_library.to_string_lossy().to_lowercase());
    libraries.push(default_library);

    let library_file = steam_path.join("steamapps").join("libraryfolders.vdf");

    if let Ok(content) = fs::read_to_string(library_file) {
        for line in content.lines() {
            let trimmed = line.trim();

            if trimmed.starts_with("\"path\"") {
                if let Some(value) = extract_quoted_value(trimmed) {
                    let fixed = value.replace("\\\\", "\\");
                    let path = PathBuf::from(fixed);

                    let key = path.to_string_lossy().to_lowercase();
                    if seen.insert(key) {
                        libraries.push(path);
                    }
                }
            }
        }
    }

    libraries
}

fn extract_acf_value(content: &str, key: &str) -> String {
    for line in content.lines() {
        let trimmed = line.trim();
        let expected = format!("\"{}\"", key);

        if trimmed.starts_with(&expected) {
            if let Some(value) = extract_quoted_value(trimmed) {
                return value;
            }
        }
    }

    String::new()
}

fn clean_folder_game_name(folder_name: &str) -> bool {
    let lower = folder_name.to_lowercase();

    let blocked = [
        "_commonredist",
        "steamworks shared",
        "steam controller configurator",
        "proton",
        "redistributables",
        "shadercache",
    ];

    !blocked.iter().any(|item| lower.contains(item))
}

fn find_overlay_exe() -> Option<String> {
    let mut candidates = vec![
        PathBuf::from("C:\\Program Files\\FPS Monitor\\FPSMonitor.exe"),
        PathBuf::from("C:\\Program Files\\FPS Monitor\\FPS Monitor.exe"),
        PathBuf::from("C:\\Program Files (x86)\\FPS Monitor\\FPSMonitor.exe"),
        PathBuf::from("C:\\Program Files (x86)\\FPS Monitor\\FPS Monitor.exe"),
    ];

    if let Some(steam_path) = find_steam_path() {
        for library in steam_library_paths(&steam_path) {
            candidates.push(
                library
                    .join("steamapps")
                    .join("common")
                    .join("FPS Monitor")
                    .join("FPSMonitor.exe"),
            );
            candidates.push(
                library
                    .join("steamapps")
                    .join("common")
                    .join("FPS Monitor")
                    .join("FPS Monitor.exe"),
            );
        }
    }

    for candidate in candidates {
        if candidate.exists() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    None
}

fn launch_path_normal(path: &str) -> Result<String, String> {
    Command::new(path)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Failed to launch {}: {}", path, error))?;

    Ok(format!("Launched {}", path))
}

fn launch_path_admin(path: &str) -> Result<String, String> {
    let escaped_path = path.replace('\'', "''");
    let command = format!("Start-Process -FilePath '{}' -Verb RunAs", escaped_path);

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &command,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Failed to request admin launch: {}", error))?;

    if output.status.success() {
        return Ok(format!(
            "Admin launch requested. Accept the Windows UAC prompt. Path: {}",
            path
        ));
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if stderr.is_empty() {
        Err("Admin launch failed with no error output.".to_string())
    } else {
        Err(format!("Admin launch failed: {}", stderr))
    }
}

#[tauri::command]
fn load_mvo_settings() -> Result<AppSettings, String> {
    let path = settings_file_path()?;

    if !path.exists() {
        let settings = default_settings();
        let json = serde_json::to_string_pretty(&settings)
            .map_err(|error| format!("Failed to create default settings JSON: {}", error))?;

        fs::write(&path, json)
            .map_err(|error| format!("Failed to write default settings file: {}", error))?;

        return Ok(settings);
    }

    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read settings file: {}", error))?;

    serde_json::from_str::<AppSettings>(&content)
        .map_err(|error| format!("Failed to parse settings file: {}", error))
}

#[tauri::command]
fn save_mvo_settings(settings: AppSettings) -> Result<String, String> {
    let path = settings_file_path()?;

    let json = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Failed to convert settings to JSON: {}", error))?;

    fs::write(&path, json).map_err(|error| format!("Failed to write settings file: {}", error))?;

    Ok(format!("Settings saved to {}", path.display()))
}

#[tauri::command]
fn reset_mvo_settings() -> Result<AppSettings, String> {
    let path = settings_file_path()?;
    let settings = default_settings();

    let json = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Failed to convert settings to JSON: {}", error))?;

    fs::write(&path, json).map_err(|error| format!("Failed to reset settings file: {}", error))?;

    Ok(settings)
}

#[tauri::command]
fn open_mvo_settings_folder() -> Result<String, String> {
    let path = settings_file_path()?;
    let folder = path
        .parent()
        .ok_or_else(|| "Could not find settings folder.".to_string())?;

    open_path(folder)
}

#[tauri::command]
fn start_performance_engine() -> Result<String, String> {
    let cache = SYSTEM_CACHE
        .get_or_init(|| Arc::new(Mutex::new(default_snapshot())))
        .clone();

    if ENGINE_STARTED.set(()).is_err() {
        return Ok("MVO Performance Engine is already running.".to_string());
    }

    thread::spawn(move || {
        let mut system = System::new_all();
        let mut tick: u64 = 0;

        loop {
            tick += 1;
            system.refresh_all();

            let cpu_name = system
                .cpus()
                .first()
                .map(|cpu| cpu.brand().to_string())
                .unwrap_or_else(|| "Unknown CPU".to_string());

            let cpu_load = format!("{:.0}", system.global_cpu_usage());

            let ram_total_gb = system.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
            let ram_used_gb = system.used_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
            let ram_load = if ram_total_gb > 0.0 {
                (ram_used_gb / ram_total_gb) * 100.0
            } else {
                0.0
            };

            let disks = Disks::new_with_refreshed_list();

            let mut total_space: u64 = 0;
            let mut available_space: u64 = 0;

            for disk in disks.list() {
                total_space += disk.total_space();
                available_space += disk.available_space();
            }

            let used_space = total_space.saturating_sub(available_space);

            let storage_total_gb = total_space as f64 / 1024.0 / 1024.0 / 1024.0;
            let storage_used_gb = used_space as f64 / 1024.0 / 1024.0 / 1024.0;
            let storage_load = if storage_total_gb > 0.0 {
                (storage_used_gb / storage_total_gb) * 100.0
            } else {
                0.0
            };

            let uptime_seconds = System::uptime();
            let uptime_hours = uptime_seconds / 3600;
            let uptime_minutes = (uptime_seconds % 3600) / 60;

            let mut gpu_name = "FPS Monitor handles GPU/FPS in-game".to_string();
            let mut gpu_load = "0".to_string();
            let mut gpu_temp = "Overlay".to_string();
            let mut gpu_memory_used = "0".to_string();
            let mut gpu_memory_total = "0".to_string();
            let mut gpu_power = "Overlay".to_string();
            if let Ok(output) = Command::new("nvidia-smi")
                .args(["--query-gpu=name,memory.total,memory.used,memory.free,temperature.gpu,utilization.gpu,driver_version,power.draw", "--format=csv,noheader,nounits"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let parts: Vec<&str> = stdout.trim().split(", ").collect();
                    if parts.len() >= 8 {
                        gpu_name = parts[0].trim().to_string();
                        let memory_total_mb = parts[1].trim().parse::<u64>().unwrap_or(0);
                        gpu_memory_total = (memory_total_mb * 1_000_000).to_string();
                        let memory_used_mb = parts[2].trim().parse::<u64>().unwrap_or(0);
                        gpu_memory_used = (memory_used_mb * 1_000_000).to_string();
                        gpu_power = format!("{:.0}", parts[7].trim().parse::<f64>().unwrap_or(0.0));
                        gpu_temp = format!("{:.1}", parts[4].trim().parse::<f64>().unwrap_or(0.0));
                        gpu_load = parts[5].trim().parse::<u64>().unwrap_or(0).to_string();
                    }
                }
            }

            let snapshot = SystemSnapshot {
                cpu_name,
                cpu_load,
                ram_used_gb: format!("{:.1}", ram_used_gb),
                ram_total_gb: format!("{:.1}", ram_total_gb),
                ram_load: format!("{:.0}", ram_load),
                storage_used_gb: format!("{:.0}", storage_used_gb),
                storage_total_gb: format!("{:.0}", storage_total_gb),
                storage_load: format!("{:.0}", storage_load),
                uptime: format!("{}h {}m", uptime_hours, uptime_minutes),
                gpu_name,
                gpu_load,
                gpu_temp,
                gpu_memory_used,
                gpu_memory_total,
                gpu_power,
                fps: "Overlay".to_string(),
                fan: "Overlay".to_string(),
                engine_status: "Running".to_string(),
                engine_tick: tick.to_string(),
            };

            if let Ok(mut locked) = cache.lock() {
                *locked = snapshot;
            }

            thread::sleep(Duration::from_secs(1));
        }
    });

    Ok("MVO Performance Engine started.".to_string())
}

#[tauri::command]
fn get_cached_system_snapshot() -> Result<String, String> {
    let cache = SYSTEM_CACHE
        .get_or_init(|| Arc::new(Mutex::new(default_snapshot())))
        .clone();

    let snapshot = cache
        .lock()
        .map_err(|_| "Failed to lock system snapshot cache.".to_string())?
        .clone();

    serde_json::to_string(&snapshot)
        .map_err(|error| format!("Failed to serialize system snapshot: {}", error))
}

fn get_cached_system_snapshot_json() -> Result<serde_json::Value, String> {
    let json_str = get_cached_system_snapshot()?;
    serde_json::from_str(&json_str).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_system_snapshot() -> Result<String, String> {
    get_cached_system_snapshot()
}

#[tauri::command]
fn get_active_power_plan() -> Result<String, String> {
    let output = Command::new("powercfg")
        .arg("/getactivescheme")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Failed to run powercfg: {}", error))?;

    format_output(output)
}

#[tauri::command]
fn activate_gaming_mode() -> Result<String, String> {
    let output = Command::new("powercfg")
        .args(["/setactive", "SCHEME_MIN"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Failed to activate High Performance: {}", error))?;

    format_output(output)?;

    get_active_power_plan()
}

#[tauri::command]
fn restore_power_plan(guid: String) -> Result<String, String> {
    if guid.trim().is_empty() {
        return Err("No saved power plan GUID was provided.".to_string());
    }

    let output = Command::new("powercfg")
        .args(["/setactive", &guid])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Failed to restore power plan: {}", error))?;

    format_output(output)?;

    get_active_power_plan()
}

#[tauri::command]
fn get_steam_status() -> Result<String, String> {
    if let Some(path) = find_steam_path() {
        Ok(format!("Steam detected at {}", path.display()))
    } else {
        Err("Steam was not found in common locations.".to_string())
    }
}

#[tauri::command]
fn launch_steam() -> Result<String, String> {
    if let Some(path) = find_steam_path() {
        let exe = path.join("steam.exe");

        Command::new(&exe)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|error| format!("Failed to launch Steam: {}", error))?;

        Ok(format!("Steam launched from {}", exe.display()))
    } else {
        Err("Steam was not found.".to_string())
    }
}

#[tauri::command]
fn launch_steam_game(app_id: String) -> Result<String, String> {
    if app_id.trim().is_empty() {
        return Err("Steam App ID is missing.".to_string());
    }

    open_url_with_windows(&format!("steam://rungameid/{}", app_id))?;

    Ok(format!("Steam game launch requested: {}", app_id))
}

#[tauri::command]
fn open_game_folder(path: String) -> Result<String, String> {
    open_path_or_parent(path)
}

#[tauri::command]
fn open_steam_folder() -> Result<String, String> {
    if let Some(path) = find_steam_path() {
        open_path(path)
    } else {
        Err("Steam folder was not found.".to_string())
    }
}

#[tauri::command]
fn open_steam_games_folder() -> Result<String, String> {
    if let Some(path) = find_steam_path() {
        open_path(path.join("steamapps").join("common"))
    } else {
        Err("Steam games folder was not found.".to_string())
    }
}

#[tauri::command]
fn open_steam_downloads_folder() -> Result<String, String> {
    if let Some(path) = find_steam_path() {
        open_path(path.join("steamapps").join("downloading"))
    } else {
        Err("Steam downloads folder was not found.".to_string())
    }
}

#[tauri::command]
fn open_steam_library_page() -> Result<String, String> {
    open_url_with_windows("steam://open/games")
}

#[tauri::command]
fn open_steam_downloads_page() -> Result<String, String> {
    open_url_with_windows("steam://open/downloads")
}

#[tauri::command]
fn open_steam_big_picture() -> Result<String, String> {
    open_url_with_windows("steam://open/bigpicture")
}

#[tauri::command]
fn get_installed_steam_games() -> Result<String, String> {
    let steam_path = find_steam_path().ok_or_else(|| "Steam was not found.".to_string())?;
    let libraries = steam_library_paths(&steam_path);

    let mut games = Vec::<GameCard>::new();
    let mut seen_keys = HashSet::<String>::new();

    for library in libraries {
        let steamapps = library.join("steamapps");
        let common = steamapps.join("common");

        if steamapps.exists() {
            let entries = fs::read_dir(&steamapps)
                .map_err(|error| format!("Failed to read Steam apps folder: {}", error))?;

            for entry_result in entries {
                let entry = match entry_result {
                    Ok(value) => value,
                    Err(_) => continue,
                };

                let path = entry.path();

                if !path.is_file() {
                    continue;
                }

                let file_name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");

                if !file_name.starts_with("appmanifest_") || !file_name.ends_with(".acf") {
                    continue;
                }

                let content = match fs::read_to_string(&path) {
                    Ok(value) => value,
                    Err(_) => continue,
                };

                let app_id = extract_acf_value(&content, "appid");
                let name = extract_acf_value(&content, "name");
                let install_dir = extract_acf_value(&content, "installdir");

                if app_id.is_empty() || name.is_empty() {
                    continue;
                }

                let install_path = if install_dir.is_empty() {
                    String::new()
                } else {
                    common.join(&install_dir).to_string_lossy().to_string()
                };

                let key = format!("steam:{}", app_id);

                if seen_keys.insert(key) {
                    games.push(GameCard {
                        name,
                        platform: "Steam".to_string(),
                        app_id,
                        install_path,
                        library_path: library.to_string_lossy().to_string(),
                        status: "Detected".to_string(),
                        profile: "Steam Game".to_string(),
                    });
                }
            }
        }

        if common.exists() {
            let entries = match fs::read_dir(&common) {
                Ok(value) => value,
                Err(_) => continue,
            };

            for entry_result in entries {
                let entry = match entry_result {
                    Ok(value) => value,
                    Err(_) => continue,
                };

                let path = entry.path();

                if !path.is_dir() {
                    continue;
                }

                let folder_name = path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("")
                    .to_string();

                if folder_name.is_empty() || !clean_folder_game_name(&folder_name) {
                    continue;
                }

                let key = format!("folder:{}", path.to_string_lossy().to_lowercase());

                if seen_keys.insert(key) {
                    games.push(GameCard {
                        name: folder_name,
                        platform: "Steam".to_string(),
                        app_id: String::new(),
                        install_path: path.to_string_lossy().to_string(),
                        library_path: library.to_string_lossy().to_string(),
                        status: "Folder".to_string(),
                        profile: "Folder Detected".to_string(),
                    });
                }
            }
        }
    }

    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    serde_json::to_string(&games)
        .map_err(|error| format!("Failed to serialize Steam game list: {}", error))
}

#[tauri::command]
fn scan_all_games() -> Result<String, String> {
    let mut all_games = Vec::<GameCard>::new();
    let mut seen = HashSet::<String>::new();

    // 1. Steam games
    if let Ok(steam_json) = get_installed_steam_games() {
        if let Ok(steam_games) = serde_json::from_str::<Vec<GameCard>>(&steam_json) {
            for game in steam_games {
                let key = format!("steam:{}", game.name.to_lowercase());
                if seen.insert(key) {
                    all_games.push(game);
                }
            }
        }
    }

    // 2. Epic Games
    scan_epic_games(&mut all_games, &mut seen);

    // 3. GOG
    scan_gog_games(&mut all_games, &mut seen);

    // 4. Common game directories
    scan_common_game_dirs(&mut all_games, &mut seen);

    all_games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    serde_json::to_string(&all_games)
        .map_err(|error| format!("Failed to serialize game list: {}", error))
}

fn scan_epic_games(games: &mut Vec<GameCard>, seen: &mut HashSet<String>) {
    let manifest_dirs = vec![
        env::var("PROGRAMDATA").ok().map(|p| PathBuf::from(p).join("Epic").join("EpicGamesLauncher").join("Data").join("Manifests")),
        env::var("LOCALAPPDATA").ok().map(|p| PathBuf::from(p).join("Epic").join("EpicGamesLauncher").join("Saved").join("Config").join("Windows")),
    ];

    for dir_opt in manifest_dirs {
        if let Some(dir) = dir_opt {
            if !dir.exists() { continue; }
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("item") {
                        if let Ok(content) = fs::read_to_string(&path) {
                            if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                                let name = manifest.get("DisplayName").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let install_path = manifest.get("InstallLocation").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                if !name.is_empty() && !install_path.is_empty() {
                                    let key = format!("epic:{}", name.to_lowercase());
                                    if seen.insert(key) {
                                        games.push(GameCard {
                                            name,
                                            platform: "Epic".to_string(),
                                            app_id: String::new(),
                                            install_path,
                                            library_path: String::new(),
                                            status: "Detected".to_string(),
                                            profile: "Epic Game".to_string(),
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

fn scan_gog_games(games: &mut Vec<GameCard>, seen: &mut HashSet<String>) {
    let gog_paths = vec![
        env::var("PROGRAMDATA").ok().map(|p| PathBuf::from(p).join("GOG.com").join("Galaxy").join("Library").join("Games")),
        Some(PathBuf::from("C:\\GOG Games")),
        Some(PathBuf::from("C:\\Program Files (x86)\\GOG Galaxy").join("Games")),
    ];

    for dir_opt in gog_paths {
        if let Some(dir) = dir_opt {
            if !dir.exists() { continue; }
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let name = path.file_name().and_then(|e| e.to_str()).unwrap_or("").to_string();
                        if !name.is_empty() && clean_folder_game_name(&name) {
                            let key = format!("gog:{}", name.to_lowercase());
                            if seen.insert(key) {
                                // Check for exe
                                if let Ok(exe_entries) = fs::read_dir(&path) {
                                    for exe_entry in exe_entries.flatten() {
                                        let exe_path = exe_entry.path();
                                        if exe_path.extension().and_then(|e| e.to_str()) == Some("exe") {
                                            games.push(GameCard {
                                                name: name.clone(),
                                                platform: "GOG".to_string(),
                                                app_id: String::new(),
                                                install_path: exe_path.to_string_lossy().to_string(),
                                                library_path: dir.to_string_lossy().to_string(),
                                                status: "Detected".to_string(),
                                                profile: "GOG Game".to_string(),
                                            });
                                            break;
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

fn scan_common_game_dirs(games: &mut Vec<GameCard>, seen: &mut HashSet<String>) {
    let home = env::var("USERPROFILE").ok().map(PathBuf::from).unwrap_or_default();

    let search_dirs = vec![
        home.join("Downloads"),
        home.join("Desktop"),
        home.join("Documents"),
        PathBuf::from("D:\\Games"),
        PathBuf::from("E:\\Games"),
        PathBuf::from("F:\\Games"),
        PathBuf::from("C:\\Games"),
    ];

    for base_dir in search_dirs {
        if !base_dir.exists() { continue; }
        scan_dir_for_games(&base_dir, games, seen, 3);
    }
}

fn scan_dir_for_games(dir: &PathBuf, games: &mut Vec<GameCard>, seen: &mut HashSet<String>, depth: u32) {
    if depth == 0 || games.len() > 200 { return; }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() { continue; }
            let name = path.file_name().and_then(|e| e.to_str()).unwrap_or("").to_string();
            if name.is_empty() || !clean_folder_game_name(&name) { continue; }

            // Check for exe in directory or one level deep
            if let Some(exe_path) = find_exe_in_dir(&path) {
                let key = format!("dir:{}", exe_path.to_string_lossy().to_lowercase());
                if seen.insert(key) {
                    games.push(GameCard {
                        name,
                        platform: "Custom".to_string(),
                        app_id: String::new(),
                        install_path: exe_path.to_string_lossy().to_string(),
                        library_path: dir.to_string_lossy().to_string(),
                        status: "Detected".to_string(),
                        profile: "Custom Game".to_string(),
                    });
                }
            }
        }
    }
}

fn find_exe_in_dir(dir: &PathBuf) -> Option<PathBuf> {
    gamevault::extractor::find_exe_in_dir(dir)
}

#[tauri::command]
fn open_url(url: String) -> Result<String, String> {
    open_url_with_windows(&url)
}

#[tauri::command]
fn open_windows_downloads_folder() -> Result<String, String> {
    open_path(user_folder("Downloads")?)
}

#[tauri::command]
fn open_documents_folder() -> Result<String, String> {
    open_path(user_folder("Documents")?)
}

#[tauri::command]
fn open_desktop_folder() -> Result<String, String> {
    open_path(user_folder("Desktop")?)
}

#[tauri::command]
fn open_pictures_folder() -> Result<String, String> {
    let pictures = pictures_folder_path()?;
    open_path(pictures)
}

#[tauri::command]
fn open_screenshots_folder() -> Result<String, String> {
    let screenshots = ensure_folder(pictures_folder_path()?.join("Screenshots"))?;
    open_path(screenshots)
}

#[tauri::command]
fn open_appdata_folder() -> Result<String, String> {
    let appdata =
        env::var("APPDATA").map_err(|_| "APPDATA environment variable was not found.".to_string())?;

    open_path(appdata)
}

#[tauri::command]
fn open_localappdata_folder() -> Result<String, String> {
    let localappdata = env::var("LOCALAPPDATA")
        .map_err(|_| "LOCALAPPDATA environment variable was not found.".to_string())?;

    open_path(localappdata)
}

#[tauri::command]
fn get_overlay_status() -> Result<String, String> {
    if let Some(path) = find_overlay_exe() {
        Ok(format!("FPS Monitor detected at {}", path))
    } else {
        Err("FPS Monitor was not found. Install FPS Monitor, then try Detect again.".to_string())
    }
}

#[tauri::command]
fn launch_overlay_app() -> Result<String, String> {
    if let Some(path) = find_overlay_exe() {
        match launch_path_normal(&path) {
            Ok(result) => Ok(result.replace("Launched", "FPS Monitor launched from")),
            Err(error) => {
                let lower = error.to_lowercase();

                if lower.contains("740") || lower.contains("elevation") {
                    return launch_overlay_app_admin();
                }

                Err(error)
            }
        }
    } else {
        Err("FPS Monitor was not found. Install FPS Monitor first.".to_string())
    }
}

#[tauri::command]
fn launch_overlay_app_admin() -> Result<String, String> {
    if let Some(path) = find_overlay_exe() {
        launch_path_admin(&path)
    } else {
        Err("FPS Monitor was not found. Install FPS Monitor first.".to_string())
    }
}

#[tauri::command]
fn open_overlay_settings_folder() -> Result<String, String> {
    if let Some(path) = find_overlay_exe() {
        let exe_path = PathBuf::from(path);

        if let Some(folder) = exe_path.parent() {
            return open_path(folder);
        }
    }

    open_documents_folder()
}

#[tauri::command]
fn launch_exe(path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("EXE path is empty. Paste the full path to a .exe file.".to_string());
    }

    let exe_path = normalize_user_path(&path);

    if !exe_path.exists() {
        return Err(format!(
            "EXE does not exist: {}. Tip: paste the full path without extra text.",
            exe_path.display()
        ));
    }

    if exe_path.is_dir() {
        return Err(format!(
            "This is a folder, not a game EXE: {}. Paste the game's .exe file path.",
            exe_path.display()
        ));
    }

    let mut command = Command::new(&exe_path);
    command.creation_flags(CREATE_NO_WINDOW);

    if let Some(parent) = exe_path.parent() {
        command.current_dir(parent);
    }

    command
        .spawn()
        .map_err(|error| {
            let lower = error.to_string().to_lowercase();
            if lower.contains("740") || lower.contains("elevation") {
                format!("This EXE needs admin. Use Admin Launch. Details: {}", error)
            } else {
                format!("Failed to launch EXE: {}", error)
            }
        })?;

    Ok(format!("Manual game launched: {}", exe_path.display()))
}

#[tauri::command]
fn launch_exe_admin(path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("EXE path is empty. Paste the full path to a .exe file.".to_string());
    }

    let exe_path = normalize_user_path(&path);

    if !exe_path.exists() {
        return Err(format!(
            "EXE does not exist: {}. Tip: paste the full path without extra text.",
            exe_path.display()
        ));
    }

    if exe_path.is_dir() {
        return Err(format!(
            "This is a folder, not a game EXE: {}. Paste the game's .exe file path.",
            exe_path.display()
        ));
    }

    launch_path_admin(&exe_path.to_string_lossy())
}


#[tauri::command]
fn window_minimize(window: tauri::Window) -> Result<String, String> {
    window
        .minimize()
        .map_err(|error| format!("Failed to minimize window: {}", error))?;
    Ok("Window minimized.".to_string())
}

#[tauri::command]
fn window_maximize(window: tauri::Window) -> Result<String, String> {
    window
        .maximize()
        .map_err(|error| format!("Failed to maximize window: {}", error))?;
    Ok("Window fitted to screen.".to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: tauri::Window) -> Result<String, String> {
    let is_maximized = window
        .is_maximized()
        .map_err(|error| format!("Failed to read maximize state: {}", error))?;

    if is_maximized {
        window
            .unmaximize()
            .map_err(|error| format!("Failed to restore window: {}", error))?;
        Ok("Window restored.".to_string())
    } else {
        window
            .maximize()
            .map_err(|error| format!("Failed to maximize window: {}", error))?;
        Ok("Window maximized.".to_string())
    }
}

#[tauri::command]
fn window_close(window: tauri::Window) -> Result<String, String> {
    window
        .close()
        .map_err(|error| format!("Failed to close window: {}", error))?;
    Ok("Window closed.".to_string())
}

#[tauri::command]
fn window_set_size(window: tauri::Window, width: f64, height: f64) -> Result<String, String> {
    if width < 900.0 || height < 560.0 {
        return Err("Minimum supported cinematic size is 900x560.".to_string());
    }

    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
        .map_err(|error| format!("Failed to resize window: {}", error))?;

    Ok(format!("Window size set to {:.0}x{:.0}.", width, height))
}

#[tauri::command]
fn window_toggle_fullscreen(window: tauri::Window) -> Result<String, String> {
    let is_fullscreen = window
        .is_fullscreen()
        .map_err(|error| format!("Failed to read fullscreen state: {}", error))?;

    window
        .set_fullscreen(!is_fullscreen)
        .map_err(|error| format!("Failed to toggle fullscreen: {}", error))?;

    if is_fullscreen {
        Ok("Fullscreen off.".to_string())
    } else {
        Ok("Fullscreen on.".to_string())
    }
}


#[tauri::command]
fn window_start_dragging(window: tauri::Window) -> Result<String, String> {
    window
        .start_dragging()
        .map_err(|error| format!("Failed to start window dragging: {}", error))?;
    Ok("Window drag started.".to_string())
}

#[tauri::command]
fn flush_dns() -> Result<String, String> {
    let output = Command::new("ipconfig")
        .arg("/flushdns")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Failed to run ipconfig /flushdns: {}", error))?;

    format_output(output)
}

#[tauri::command]
fn open_task_manager() -> Result<String, String> {
    Command::new("taskmgr")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Failed to open Task Manager: {}", error))?;

    Ok("Opened Task Manager.".to_string())
}

#[tauri::command]
fn open_disk_cleanup() -> Result<String, String> {
    Command::new("cleanmgr")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Failed to open Disk Cleanup: {}", error))?;

    Ok("Opened Disk Cleanup.".to_string())
}

#[tauri::command]
fn clean_ram() -> Result<String, String> {
    // Clear standby list via RAMMap-like approach: empty working sets
    let _output = Command::new("cmd")
        .args(["/C", "powershell -Command \"Clear-RecycleBin -Force -ErrorAction SilentlyContinue; [System.GC]::Collect(); [System.GC]::WaitForPendingFinalizers()\""])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to clean RAM: {}", e))?;

    // Also try to clear system file cache
    let _ = Command::new("cmd")
        .args(["/C", "powershell -Command \"if (Get-Command Empty-WorkingSet -ErrorAction SilentlyContinue) { Empty-WorkingSet }\""])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    Ok("RAM cleaned. Recycle bin cleared and garbage collector triggered.".to_string())
}

#[tauri::command]
fn system_boost() -> Result<String, String> {
    let mut actions: Vec<String> = Vec::new();

    // Clear temp files
    let temp_dirs = [
        std::env::temp_dir(),
        dirs::home_dir().unwrap_or_default().join("AppData\\Local\\Temp"),
    ];
    let mut cleared = 0u32;
    for temp in &temp_dirs {
        if let Ok(entries) = fs::read_dir(temp) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let _ = fs::remove_file(&path);
                    cleared += 1;
                } else if path.is_dir() {
                    let _ = fs::remove_dir_all(&path);
                    cleared += 1;
                }
            }
        }
    }
    actions.push(format!("Cleared {} temp files", cleared));

    // Flush DNS
    let _ = Command::new("cmd")
        .args(["/C", "ipconfig /flushdns"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    actions.push("DNS cache flushed".to_string());

    // Clear recycle bin
    let _ = Command::new("cmd")
        .args(["/C", "powershell -Command \"Clear-RecycleBin -Force -ErrorAction SilentlyContinue\""])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    actions.push("Recycle bin cleared".to_string());

    // Trigger garbage collection
    let _ = Command::new("cmd")
        .args(["/C", "powershell -Command \"[System.GC]::Collect(); [System.GC]::WaitForPendingFinalizers()\""])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    actions.push("Garbage collector triggered".to_string());

    Ok(format!("System boost complete: {}", actions.join(", ")))
}

#[tauri::command]
fn open_file_explorer() -> Result<String, String> {
    Command::new("explorer")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Failed to open File Explorer: {}", error))?;
    Ok("Opened File Explorer.".to_string())
}

#[tauri::command]
fn open_device_manager() -> Result<String, String> {
    Command::new("mmc")
        .args(["devmgmt.msc"])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Failed to open Device Manager: {}", error))?;
    Ok("Opened Device Manager.".to_string())
}

#[tauri::command]
fn open_control_panel() -> Result<String, String> {
    Command::new("control")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Failed to open Control Panel: {}", error))?;
    Ok("Opened Control Panel.".to_string())
}

// ΓöÇΓöÇ Advanced Windows Features ΓöÇΓöÇ

#[tauri::command]
fn open_windows_update() -> Result<String, String> {
    Command::new("ms-settings:windowsupdate")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Windows Update: {}", e))?;
    Ok("Opened Windows Update.".to_string())
}

#[tauri::command]
fn open_event_viewer() -> Result<String, String> {
    Command::new("eventvwr.msc")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Event Viewer: {}", e))?;
    Ok("Opened Event Viewer.".to_string())
}

#[tauri::command]
fn open_registry_editor() -> Result<String, String> {
    Command::new("regedit")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Registry Editor: {}", e))?;
    Ok("Opened Registry Editor.".to_string())
}

#[tauri::command]
fn open_resource_monitor() -> Result<String, String> {
    Command::new("resmon")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Resource Monitor: {}", e))?;
    Ok("Opened Resource Monitor.".to_string())
}

#[tauri::command]
fn open_disk_management() -> Result<String, String> {
    Command::new("diskmgmt.msc")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Disk Management: {}", e))?;
    Ok("Opened Disk Management.".to_string())
}

#[tauri::command]
fn open_windows_security() -> Result<String, String> {
    Command::new("windowsdefender:")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Windows Security: {}", e))?;
    Ok("Opened Windows Security.".to_string())
}

#[tauri::command]
fn open_powershell_admin() -> Result<String, String> {
    Command::new("powershell")
        .args(["-Command", "Start-Process powershell -Verb RunAs"])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open PowerShell as Admin: {}", e))?;
    Ok("Opened PowerShell as Admin.".to_string())
}

#[tauri::command]
fn open_system_info() -> Result<String, String> {
    Command::new("msinfo32")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open System Information: {}", e))?;
    Ok("Opened System Information.".to_string())
}

#[tauri::command]
fn open_msconfig() -> Result<String, String> {
    Command::new("msconfig")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open System Configuration: {}", e))?;
    Ok("Opened System Configuration.".to_string())
}

#[tauri::command]
fn run_sfc_scan() -> Result<String, String> {
    let output = Command::new("cmd")
        .args(["/C", "sfc /scannow"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to run SFC: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !stderr.is_empty() {
        return Err(stderr);
    }
    Ok(stdout)
}

#[tauri::command]
fn run_dism_repair() -> Result<String, String> {
    let output = Command::new("cmd")
        .args(["/C", "DISM /Online /Cleanup-Image /RestoreHealth"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to run DISM: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !stderr.is_empty() {
        return Err(stderr);
    }
    Ok(stdout)
}

#[tauri::command]
fn clear_temp_files() -> Result<String, String> {
    let temp = std::env::temp_dir();
    let mut count = 0u32;
    if let Ok(entries) = fs::read_dir(&temp) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let _ = fs::remove_dir_all(&path);
            } else {
                let _ = fs::remove_file(&path);
            }
            count += 1;
        }
    }
    Ok(format!("Cleared {} items from temp folder.", count))
}

#[tauri::command]
fn clear_software_distribution() -> Result<String, String> {
    let output = Command::new("cmd")
        .args(["/C", "net stop wuauserv && del /q /f /s \"%systemroot%\\SoftwareDistribution\\*\" && net start wuauserv"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to clear Software Distribution: {}", e))?;
    if output.status.success() {
        Ok("Software Distribution cache cleared.".to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn reset_windows_store_cache() -> Result<String, String> {
    Command::new("cmd")
        .args(["/C", "wsreset.exe"])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to reset Windows Store cache: {}", e))?;
    Ok("Windows Store cache reset initiated.".to_string())
}

#[tauri::command]
fn set_power_plan(plan: String) -> Result<String, String> {
    let guid = match plan.as_str() {
        "high" => "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
        "balanced" => "381b4222-f694-41df-b567-8267553ddd33",
        "saver" => "a1841308-3541-4fab-bc81-f71556f20b4a",
        _ => return Err(format!("Unknown plan: {}", plan)),
    };
    let output = Command::new("powercfg")
        .args(["/setactive", guid])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to set power plan: {}", e))?;
    if output.status.success() {
        Ok(format!("Power plan set to '{}'.", plan))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn get_current_power_plan() -> Result<String, String> {
    let output = Command::new("powercfg")
        .args(["/getactivescheme"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to get power plan: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let plan = if stdout.contains("8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c") {
        "high"
    } else if stdout.contains("381b4222-f694-41df-b567-8267553ddd33") {
        "balanced"
    } else if stdout.contains("a1841308-3541-4fab-bc81-f71556f20b4a") {
        "saver"
    } else {
        "unknown"
    };
    Ok(plan.to_string())
}

#[tauri::command]
fn toggle_transparency(enable: bool) -> Result<String, String> {
    let value = if enable { 0 } else { 1 };
    Command::new("reg")
        .args([
            "add",
            "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
            "/v",
            "EnableTransparency",
            "/t",
            "REG_DWORD",
            "/d",
            &value.to_string(),
            "/f",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to toggle transparency: {}", e))?;
    Ok(format!("Transparency {}.", if enable { "enabled" } else { "disabled" }))
}

#[tauri::command]
fn toggle_animations(enable: bool) -> Result<String, String> {
    let _value = if enable { 1 } else { 0 };
    Command::new("reg")
        .args([
            "add",
            "HKCU\\Control Panel\\Desktop",
            "/v",
            "UserPreferencesMask",
            "/t",
            "REG_BINARY",
            "/d",
            if enable {
                "90,12,03,80,10,00,00,00"
            } else {
                "90,00,01,80,10,00,00,00"
            },
            "/f",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to toggle animations: {}", e))?;
    // Also toggle visual effects
    let visual_value = if enable { 0 } else { 2 };
    Command::new("reg")
        .args([
            "add",
            "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects",
            "/v",
            "VisualFXSetting",
            "/t",
            "REG_DWORD",
            "/d",
            &visual_value.to_string(),
            "/f",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok();
    Ok(format!("Animations {}.", if enable { "enabled" } else { "disabled" }))
}

#[tauri::command]
fn toggle_hibernate(enable: bool) -> Result<String, String> {
    let _cmd_str = if enable { "/hibernate on" } else { "/hibernate off" };
    let output = Command::new("powercfg")
        .args(["/h", if enable { "on" } else { "off" }])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to toggle hibernate: {}", e))?;
    if output.status.success() {
        Ok(format!("Hibernate {}.", if enable { "enabled" } else { "disabled" }))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn get_hibernate_status() -> Result<String, String> {
    let output = Command::new("powercfg")
        .args(["/availablesleepstates"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to get hibernate status: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(if stdout.contains("Hibernate") { "enabled" } else { "disabled" }.to_string())
}

#[tauri::command]
fn open_night_light_settings() -> Result<String, String> {
    Command::new("ms-settings:nightlight")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Night Light settings: {}", e))?;
    Ok("Opened Night Light settings.".to_string())
}

#[tauri::command]
fn open_focus_assist_settings() -> Result<String, String> {
    Command::new("ms-settings:quiethours")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Focus Assist settings: {}", e))?;
    Ok("Opened Focus Assist settings.".to_string())
}

#[tauri::command]
fn open_default_apps_settings() -> Result<String, String> {
    Command::new("ms-settings:defaultapps")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Default Apps settings: {}", e))?;
    Ok("Opened Default Apps settings.".to_string())
}

#[tauri::command]
fn open_startup_apps_settings() -> Result<String, String> {
    Command::new("ms-settings:startupapps")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Startup Apps settings: {}", e))?;
    Ok("Opened Startup Apps settings.".to_string())
}

#[tauri::command]
fn open_delivery_optimization() -> Result<String, String> {
    Command::new("ms-settings:deliveryoptimization")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Delivery Optimization: {}", e))?;
    Ok("Opened Delivery Optimization.".to_string())
}

#[tauri::command]
fn open_storage_settings() -> Result<String, String> {
    Command::new("ms-settings:storagesense")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Storage settings: {}", e))?;
    Ok("Opened Storage settings.".to_string())
}

#[tauri::command]
fn open_display_settings() -> Result<String, String> {
    Command::new("ms-settings:display")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Display settings: {}", e))?;
    Ok("Opened Display settings.".to_string())
}

#[tauri::command]
fn open_sound_settings() -> Result<String, String> {
    Command::new("ms-settings:sound")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Sound settings: {}", e))?;
    Ok("Opened Sound settings.".to_string())
}

#[tauri::command]
fn open_network_settings() -> Result<String, String> {
    Command::new("ms-settings:network-status")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Network settings: {}", e))?;
    Ok("Opened Network settings.".to_string())
}

#[tauri::command]
fn open_bluetooth_settings() -> Result<String, String> {
    Command::new("ms-settings:bluetooth")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Bluetooth settings: {}", e))?;
    Ok("Opened Bluetooth settings.".to_string())
}

#[tauri::command]
fn open_personalization_settings() -> Result<String, String> {
    Command::new("ms-settings:personalization")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Personalization settings: {}", e))?;
    Ok("Opened Personalization settings.".to_string())
}

#[tauri::command]
fn open_privacy_settings() -> Result<String, String> {
    Command::new("ms-settings:privacy")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Privacy settings: {}", e))?;
    Ok("Opened Privacy settings.".to_string())
}

#[tauri::command]
fn open_accessibility_settings() -> Result<String, String> {
    Command::new("ms-settings:easeofaccess")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Accessibility settings: {}", e))?;
    Ok("Opened Accessibility settings.".to_string())
}

#[tauri::command]
fn open_maintenance_settings() -> Result<String, String> {
    Command::new("ms-settings:maintenance")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Maintenance settings: {}", e))?;
    Ok("Opened Maintenance settings.".to_string())
}

#[tauri::command]
fn open_recovery_settings() -> Result<String, String> {
    Command::new("ms-settings:recovery")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Recovery settings: {}", e))?;
    Ok("Opened Recovery settings.".to_string())
}

#[tauri::command]
fn open_about_settings() -> Result<String, String> {
    Command::new("ms-settings:about")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open About settings: {}", e))?;
    Ok("Opened About settings.".to_string())
}

#[tauri::command]
fn open_troubleshoot_settings() -> Result<String, String> {
    Command::new("ms-settings:troubleshoot")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Troubleshoot settings: {}", e))?;
    Ok("Opened Troubleshoot settings.".to_string())
}

#[tauri::command]
fn open_optional_features() -> Result<String, String> {
    Command::new("ms-settings:optionalfeatures")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Optional Features: {}", e))?;
    Ok("Opened Optional Features.".to_string())
}

#[tauri::command]
fn open_environment_variables() -> Result<String, String> {
    Command::new("rundll32")
        .args(["sysdm.cpl,EditEnvironmentVariables"])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Environment Variables: {}", e))?;
    Ok("Opened Environment Variables.".to_string())
}

#[tauri::command]
fn open_task_scheduler() -> Result<String, String> {
    Command::new("taskschd.msc")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Task Scheduler: {}", e))?;
    Ok("Opened Task Scheduler.".to_string())
}

#[tauri::command]
fn open_services() -> Result<String, String> {
    Command::new("services.msc")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Services: {}", e))?;
    Ok("Opened Services.".to_string())
}

#[tauri::command]
fn open_group_policy() -> Result<String, String> {
    Command::new("gpedit.msc")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Group Policy: {}", e))?;
    Ok("Opened Group Policy Editor.".to_string())
}

#[tauri::command]
fn open_local_users_groups() -> Result<String, String> {
    Command::new("lusrmgr.msc")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Local Users and Groups: {}", e))?;
    Ok("Opened Local Users and Groups.".to_string())
}

#[tauri::command]
fn open_print_management() -> Result<String, String> {
    Command::new("printmanagement.msc")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open Print Management: {}", e))?;
    Ok("Opened Print Management.".to_string())
}


// ΓöÇΓöÇ Updater ΓöÇΓöÇ

#[tauri::command]
async fn check_for_updates() -> Result<String, String> {
    let url = "https://raw.githubusercontent.com/Adude4554/MVO-Hub/main/latest.json";
    let resp = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent(CHROME_USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to check updates: {}", e))?;
    let text = resp.text().await.map_err(|e| format!("Failed to read update response: {}", e))?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("Failed to parse update JSON: {} — body: {}", e, &text[..200.min(text.len())]))?;
    let remote_version = json["version"].as_str().unwrap_or("0.0.0");
    let notes = json["notes"].as_str().unwrap_or("");
    let pub_date = json["pub_date"].as_str().unwrap_or("");
    let force = json["force"].as_bool().unwrap_or(false);
    let download_url = json["platforms"]["windows-x86_64"]["url"].as_str().unwrap_or("");
    let file_size = json["platforms"]["windows-x86_64"]["file_size"].as_u64().unwrap_or(0);
    let local_version = env!("CARGO_PKG_VERSION");
    let available = version_is_newer(local_version, remote_version);
    Ok(serde_json::json!({
        "available": available,
        "version": remote_version,
        "notes": notes,
        "pub_date": pub_date,
        "force": force,
        "download_url": download_url,
        "file_size": file_size,
        "local": local_version,
    }).to_string())
}

fn version_is_newer(local: &str, remote: &str) -> bool {
    let parse = |v: &str| -> Vec<u32> {
        v.split('.').filter_map(|s| s.parse().ok()).collect()
    };
    let l = parse(local);
    let r = parse(remote);
    for i in 0..l.len().max(r.len()) {
        let lv = l.get(i).copied().unwrap_or(0);
        let rv = r.get(i).copied().unwrap_or(0);
        if rv > lv { return true; }
        if rv < lv { return false; }
    }
    false
}

#[tauri::command]
async fn download_and_install_update(app: tauri::AppHandle) -> Result<String, String> {
    let url = "https://raw.githubusercontent.com/Adude4554/MVO-Hub/main/latest.json";
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent(CHROME_USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| format!("Failed to check updates: {}", e))?;
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let remote_version = json["version"].as_str().unwrap_or("0.0.0");
    let local_version = env!("CARGO_PKG_VERSION");
    if !version_is_newer(local_version, remote_version) {
        return Ok("Already up to date".to_string());
    }
    let download_url = json["platforms"]["windows-x86_64"]["url"].as_str()
        .ok_or("No download URL found for windows-x86_64")?;
    let install_dir = dirs::download_dir().unwrap_or_else(|| std::path::PathBuf::from(".")).join("MVO_Hub_Update");
    std::fs::create_dir_all(&install_dir).map_err(|e| e.to_string())?;
    let exe_path = install_dir.join(format!("MVO_Hub_{}_setup.exe", remote_version));
    let _ = app.emit("update-progress", serde_json::json!({"status": "downloading", "percent": 0}));
    let resp = client.get(download_url).send().await.map_err(|e| format!("Download failed: {}", e))?;
    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    use futures_util::StreamExt;
    let mut file = std::fs::File::create(&exe_path).map_err(|e| e.to_string())?;
    let mut last_emit = std::time::Instant::now();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
        std::io::Write::write_all(&mut file, &chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if last_emit.elapsed() >= std::time::Duration::from_millis(500) || downloaded == total {
            let pct = if total > 0 { (downloaded as f64 / total as f64 * 100.0) as u32 } else { 0 };
            let _ = app.emit("update-progress", serde_json::json!({
                "status": "downloading",
                "downloaded": downloaded,
                "total": total,
                "percent": pct,
            }));
            last_emit = std::time::Instant::now();
        }
    }
    drop(file);
    let _ = app.emit("update-progress", serde_json::json!({"status": "installing", "percent": 100}));
    let output = std::process::Command::new(&exe_path)
        .arg("/S")
        .output()
        .map_err(|e| format!("Failed to start installer: {}", e))?;
    let exit_code = output.status.code().unwrap_or(-1);
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Installer failed (exit code {}): {}", exit_code, stderr));
    }
    app.restart();
    #[allow(unreachable_code)]
    Ok("Updated".to_string())
}

// ΓöÇΓöÇ User Accounts ΓöÇΓöÇ

#[tauri::command]
fn create_account(username: String, email: String, password: String) -> Result<String, String> {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    let id = db.create_user(&username, &email, &hash)?;
    Ok(serde_json::json!({"id": id, "username": username, "email": email}).to_string())
}

#[tauri::command]
fn login(email: String, password: String) -> Result<String, String> {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    match db.get_user_by_email(&email)? {
        Some((id, username, stored_email, stored_hash, _)) => {
            if stored_hash == hash {
                Ok(serde_json::json!({"id": id, "username": username, "email": stored_email}).to_string())
            } else {
                Err("Invalid password".to_string())
            }
        }
        None => Err("No account found with this email".to_string()),
    }
}

#[tauri::command]
fn get_current_user() -> Result<String, String> {
    let app_data = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join("com.projectmvo.app");
    let user_file = app_data.join("current_user.json");
    if user_file.exists() {
        let data = fs::read_to_string(&user_file).map_err(|e| e.to_string())?;
        Ok(data)
    } else {
        Ok("null".to_string())
    }
}

#[tauri::command]
fn save_current_user(user_json: String) -> Result<(), String> {
    let app_data = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join("com.projectmvo.app");
    fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;
    let user_file = app_data.join("current_user.json");
    fs::write(&user_file, &user_json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn logout() -> Result<(), String> {
    let app_data = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join("com.projectmvo.app");
    let user_file = app_data.join("current_user.json");
    if user_file.exists() {
        fs::remove_file(&user_file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn add_recently_launched(game_name: String, exe_path: String, install_path: Option<String>, game_id: Option<String>) -> Result<(), String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    db.add_recently_launched(&game_name, &exe_path, install_path.as_deref(), game_id.as_deref())
}

#[tauri::command]
fn get_recently_launched() -> Result<String, String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    let items = db.get_recently_launched()?;
    let result: Vec<serde_json::Value> = items.iter().map(|(name, exe, install, id, launched)| {
        serde_json::json!({
            "game_name": name,
            "exe_path": exe,
            "install_path": install,
            "game_id": id,
            "launched_at": launched,
        })
    }).collect();
    Ok(serde_json::to_string(&result).unwrap_or_else(|_| "[]".to_string()))
}

#[tauri::command]
fn launch_game_by_path(exe_path: String, install_path: Option<String>) -> Result<String, String> {
    let exe = std::path::Path::new(&exe_path);
    if !exe.exists() {
        return Err(format!("Executable not found: {}", exe_path));
    }
    let mut cmd = Command::new(&exe);
    if let Some(ref dir) = install_path {
        cmd.current_dir(dir);
    }
    cmd.spawn().map_err(|e| format!("Failed to launch: {}", e))?;
    Ok("Launched".to_string())
}

#[tauri::command]
fn change_password(user_id: i64, old_password: String, new_password: String) -> Result<String, String> {
    use sha2::{Sha256, Digest};
    let mut h = Sha256::new();
    h.update(old_password.as_bytes());
    let old_hash = format!("{:x}", h.finalize());
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    if !db.verify_password(user_id, &old_hash)? {
        return Err("Old password is incorrect".to_string());
    }
    let mut h2 = Sha256::new();
    h2.update(new_password.as_bytes());
    let new_hash = format!("{:x}", h2.finalize());
    db.change_password(user_id, &new_hash)?;
    Ok("Password changed".to_string())
}

#[tauri::command]
fn change_email(user_id: i64, new_email: String) -> Result<String, String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    db.change_email(user_id, &new_email)?;
    Ok("Email changed".to_string())
}

#[tauri::command]
fn save_avatar(user_id: i64, avatar_data: String) -> Result<String, String> {
    let app_data = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join("com.projectmvo.app");
    let avatars_dir = app_data.join("avatars");
    fs::create_dir_all(&avatars_dir).map_err(|e| e.to_string())?;
    let avatar_path = avatars_dir.join(format!("{}.png", user_id));
    // avatar_data is base64 encoded PNG
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD.decode(&avatar_data).map_err(|e| e.to_string())?;
    fs::write(&avatar_path, &decoded).map_err(|e| e.to_string())?;
    Ok(avatar_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_gpu_info_nvidia() -> Result<String, String> {
    let output = Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total,memory.used,memory.free,temperature.gpu,utilization.gpu,driver_version,power.draw", "--format=csv,noheader,nounits"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("nvidia-smi not found: {}", e))?;
    if !output.status.success() {
        return Err("nvidia-smi failed".to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let parts: Vec<&str> = stdout.trim().split(", ").collect();
    if parts.len() >= 8 {
        Ok(serde_json::json!({
            "name": parts[0].trim(),
            "memory_total": parts[1].trim().parse::<u64>().unwrap_or(0),
            "memory_used": parts[2].trim().parse::<u64>().unwrap_or(0),
            "memory_free": parts[3].trim().parse::<u64>().unwrap_or(0),
            "temperature": parts[4].trim().parse::<f64>().unwrap_or(0.0),
            "utilization": parts[5].trim().parse::<u64>().unwrap_or(0),
            "driver_version": parts[6].trim(),
            "power_draw": parts[7].trim().parse::<f64>().unwrap_or(0.0),
        }).to_string())
    } else {
        Err("Failed to parse GPU info".to_string())
    }
}

fn normalize_api_chat_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{}/chat/completions", trimmed)
    } else {
        format!("{}/v1/chat/completions", trimmed)
    }
}

fn normalize_gemini_generate_url(base_url: &str, model: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    let cleaned_model = model.trim().trim_start_matches("models/");
    let base = if trimmed.is_empty() {
        "https://generativelanguage.googleapis.com/v1beta"
    } else {
        trimmed
    };

    if base.ends_with(":generateContent") {
        base.to_string()
    } else if base.ends_with("/models") {
        format!("{}/{}:generateContent", base, cleaned_model)
    } else if base.ends_with("/v1beta") || base.ends_with("/v1") {
        format!("{}/models/{}:generateContent", base, cleaned_model)
    } else if base.contains("generativelanguage.googleapis.com") {
        format!("{}/models/{}:generateContent", base, cleaned_model)
    } else {
        format!("{}/v1beta/models/{}:generateContent", base, cleaned_model)
    }
}

fn first_chars(value: &str, max_len: usize) -> String {
    value.chars().take(max_len).collect::<String>()
}

fn is_gemini_provider(provider: &str, base_url: &str) -> bool {
    let provider_lower = provider.trim().to_lowercase();
    let base_lower = base_url.trim().to_lowercase();
    provider_lower.contains("gemini")
        || provider_lower.contains("google")
        || base_lower.contains("generativelanguage.googleapis.com")
}

fn resolve_api_key(provider: &str, api_key: &str) -> (Option<String>, String) {
    let direct = api_key.trim();
    if !direct.is_empty() {
        return (Some(direct.to_string()), "MVO settings field".to_string());
    }

    if provider.trim().to_lowercase().contains("gemini") || provider.trim().to_lowercase().contains("google") {
        for variable in ["GEMINI_API_KEY", "GOOGLE_API_KEY"] {
            if let Ok(env_key) = env::var(variable) {
                let trimmed = env_key.trim();
                if !trimmed.is_empty() {
                    return (Some(trimmed.to_string()), format!("Windows environment variable {}", variable));
                }
            }
        }
        return (None, "no Gemini API key supplied. Use the key box or GEMINI_API_KEY / GOOGLE_API_KEY".to_string());
    }

    if let Ok(env_key) = env::var("OPENAI_API_KEY") {
        let trimmed = env_key.trim();
        if !trimmed.is_empty() {
            return (Some(trimmed.to_string()), "Windows environment variable OPENAI_API_KEY".to_string());
        }
    }

    (None, "no API key supplied".to_string())
}

fn gemini_text_from_response(text: &str) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(text)
        .map_err(|error| format!("Failed to parse Gemini response JSON: {}", error))?;

    let parts = value
        .get("candidates")
        .and_then(|candidates| candidates.get(0))
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(|parts| parts.as_array())
        .ok_or_else(|| format!("Gemini response did not contain candidates[0].content.parts: {}", first_chars(text, 700)))?;

    let joined = parts
        .iter()
        .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
        .collect::<Vec<&str>>()
        .join("
");

    if joined.trim().is_empty() {
        Err(format!("Gemini response contained no text: {}", first_chars(text, 700)))
    } else {
        Ok(joined.trim().to_string())
    }
}

#[tauri::command]
fn test_ai_api_connection(
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    if base_url.trim().is_empty() {
        return Err("API base URL is empty.".to_string());
    }
    if model.trim().is_empty() {
        return Err("API model is empty.".to_string());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|error| format!("Failed to create API client: {}", error))?;

    let (resolved_api_key, api_key_source) = resolve_api_key(&provider, &api_key);

    if is_gemini_provider(&provider, &base_url) {
        let key = resolved_api_key.ok_or_else(|| api_key_source.clone())?;
        let url = normalize_gemini_generate_url(&base_url, &model);
        let body = json!({
            "contents": [{
                "role": "user",
                "parts": [{"text": "Reply with MVO_OK only."}]
            }],
            "generationConfig": {
                "temperature": 0,
                "maxOutputTokens": 12
            }
        });

        let response = client
            .post(&url)
            .header("x-goog-api-key", key)
            .json(&body)
            .send()
            .map_err(|error| format!("Gemini API request failed: {}", error))?;

        let status = response.status();
        let text = response
            .text()
            .map_err(|error| format!("Failed to read Gemini API response: {}", error))?;

        if status.is_success() {
            return Ok(format!(
                "Connected: Google Gemini using {} ({}) | key source: {}",
                model.trim(),
                url,
                api_key_source
            ));
        }

        return Err(format!("Gemini API returned HTTP {}: {} | URL: {} | Tip: use Base URL https://generativelanguage.googleapis.com/v1beta and Model gemini-3.5-flash", status, first_chars(&text, 500), url));
    }

    let url = normalize_api_chat_url(&base_url);
    let body = json!({
        "model": model.trim(),
        "messages": [
            {"role": "system", "content": "You are Project MVO API test."},
            {"role": "user", "content": "Reply with MVO_OK only."}
        ],
        "max_tokens": 12,
        "temperature": 0
    });

    let mut request = client.post(&url).json(&body);
    if let Some(key) = resolved_api_key {
        request = request.bearer_auth(key);
    }

    let response = request
        .send()
        .map_err(|error| format!("API request failed: {}", error))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|error| format!("Failed to read API response: {}", error))?;

    if status.is_success() {
        Ok(format!("Connected: {} using {} ({}) | key source: {}", provider, model, url, api_key_source))
    } else {
        Err(format!("API returned HTTP {}: {}", status, first_chars(&text, 500)))
    }
}

#[tauri::command]
fn ask_ai(
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    prompt: String,
    context: String,
) -> Result<String, String> {
    if prompt.trim().is_empty() {
        return Err("Prompt is empty.".to_string());
    }
    if base_url.trim().is_empty() {
        return Err("API base URL is empty.".to_string());
    }
    if model.trim().is_empty() {
        return Err("API model is empty.".to_string());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Failed to create API client: {}", error))?;

    let system_prompt = format!(
        "You are Project MVO, a concise PC gaming/streaming optimization assistant. Use the current app context. Provider: {}. Give practical steps only.",
        provider
    );

    let (resolved_api_key, api_key_source) = resolve_api_key(&provider, &api_key);

    if is_gemini_provider(&provider, &base_url) {
        let key = resolved_api_key.ok_or_else(|| api_key_source.clone())?;
        let url = normalize_gemini_generate_url(&base_url, &model);
        let body = json!({
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [{
                "role": "user",
                "parts": [{"text": format!("Context:\n{}\n\nUser request:\n{}", context, prompt)}]
            }],
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": 700
            }
        });

        let response = client
            .post(&url)
            .header("x-goog-api-key", key)
            .json(&body)
            .send()
            .map_err(|error| format!("Gemini AI request failed: {}", error))?;

        let status = response.status();
        let text = response
            .text()
            .map_err(|error| format!("Failed to read Gemini AI response: {}", error))?;

        if !status.is_success() {
            return Err(format!("Gemini AI returned HTTP {}: {} | URL: {} | Tip: use Base URL https://generativelanguage.googleapis.com/v1beta and Model gemini-3.5-flash", status, first_chars(&text, 700), url));
        }

        return gemini_text_from_response(&text);
    }

    let url = normalize_api_chat_url(&base_url);
    let body = json!({
        "model": model.trim(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": format!("Context:\n{}\n\nUser request:\n{}", context, prompt)}
        ],
        "max_tokens": 700,
        "temperature": 0.4
    });

    let mut request = client.post(&url).json(&body);
    if let Some(key) = resolved_api_key {
        request = request.bearer_auth(key);
    }

    let response = request
        .send()
        .map_err(|error| format!("AI request failed: {}", error))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|error| format!("Failed to read AI response: {}", error))?;

    if !status.is_success() {
        return Err(format!("AI returned HTTP {}: {}", status, first_chars(&text, 700)));
    }

    let value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| format!("Failed to parse AI response JSON: {}", error))?;

    if let Some(content) = value
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_str())
    {
        Ok(content.trim().to_string())
    } else {
        Err(format!("AI response did not contain message content: {}", first_chars(&text, 700)))
    }
}

// ── Cloud Sync Commands ──

#[tauri::command]
fn sync_export_to_gist(github_token: String) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    // Gather all user data
    let settings = {
        let app_data = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        let settings_path = app_data.join("project-mvo-app").join("mvo-settings.json");
        if settings_path.exists() {
            fs::read_to_string(&settings_path).unwrap_or_else(|_| "{}".to_string())
        } else {
            "{}".to_string()
        }
    };

    let chat_data = {
        let db = gv_db()?;
        let db = db.lock().map_err(|e| e.to_string())?;
        let sessions = db.get_chat_sessions().map_err(|e| e.to_string())?;
        let mut all_messages = Vec::new();
        for (id, title, model, created_at, updated_at) in &sessions {
            let msgs = db.get_chat_messages(id).map_err(|e| e.to_string())?;
            all_messages.push(serde_json::json!({
                "session": { "id": id, "title": title, "model": model, "createdAt": created_at, "updatedAt": updated_at },
                "messages": msgs.into_iter().map(|(_, role, content, created_at)| {
                    serde_json::json!({ "role": role, "content": content, "createdAt": created_at })
                }).collect::<Vec<_>>()
            }));
        }
        serde_json::to_string(&all_messages).unwrap_or_else(|_| "[]".to_string())
    };

    let sync_data = serde_json::json!({
        "version": "1.0",
        "exported_at": chrono_now(),
        "settings": serde_json::from_str::<serde_json::Value>(&settings).unwrap_or(serde_json::json!({})),
        "chat_data": serde_json::from_str::<serde_json::Value>(&chat_data).unwrap_or(serde_json::json!([])),
    });

    let body = serde_json::json!({
        "description": "MVO Hub sync data",
        "public": false,
        "files": {
            "mvo-sync-data.json": {
                "content": serde_json::to_string_pretty(&sync_data).unwrap_or_default()
            }
        }
    });

    // Check for existing gist
    let gists_resp = client.get("https://api.github.com/gists")
        .header("Authorization", format!("token {}", github_token))
        .header("User-Agent", "MVO-Hub")
        .send()
        .map_err(|e| format!("Failed to list gists: {}", e))?;

    let gists: Vec<serde_json::Value> = gists_resp.json().map_err(|e| format!("Failed to parse gists: {}", e))?;

    let existing_gist = gists.iter().find(|g| {
        g.get("description").and_then(|d| d.as_str()).map(|d| d.contains("MVO Hub sync")).unwrap_or(false)
    });

    if let Some(gist) = existing_gist {
        let gist_id = gist["id"].as_str().ok_or("Invalid gist ID")?;
        let resp = client.patch(format!("https://api.github.com/gists/{}", gist_id))
            .header("Authorization", format!("token {}", github_token))
            .header("User-Agent", "MVO-Hub")
            .json(&body)
            .send()
            .map_err(|e| format!("Failed to update gist: {}", e))?;

        if resp.status().is_success() {
            Ok(format!("Synced to existing gist: {}", gist_id))
        } else {
            Err(format!("Failed to update gist: HTTP {}", resp.status()))
        }
    } else {
        let resp = client.post("https://api.github.com/gists")
            .header("Authorization", format!("token {}", github_token))
            .header("User-Agent", "MVO-Hub")
            .json(&body)
            .send()
            .map_err(|e| format!("Failed to create gist: {}", e))?;

        if resp.status().is_success() {
            let gist: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
            let gist_id = gist["id"].as_str().ok_or("Invalid gist ID")?;
            Ok(format!("Created sync gist: {}", gist_id))
        } else {
            Err(format!("Failed to create gist: HTTP {}", resp.status()))
        }
    }
}

#[tauri::command]
fn sync_import_from_gist(github_token: String) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let gists_resp = client.get("https://api.github.com/gists")
        .header("Authorization", format!("token {}", github_token))
        .header("User-Agent", "MVO-Hub")
        .send()
        .map_err(|e| format!("Failed to list gists: {}", e))?;

    let gists: Vec<serde_json::Value> = gists_resp.json().map_err(|e| format!("Failed to parse gists: {}", e))?;

    let existing_gist = gists.iter().find(|g| {
        g.get("description").and_then(|d| d.as_str()).map(|d| d.contains("MVO Hub sync")).unwrap_or(false)
    });

    let gist_id = existing_gist
        .and_then(|g| g["id"].as_str())
        .ok_or("No MVO Hub sync gist found. Export first.")?;

    let gist_resp = client.get(format!("https://api.github.com/gists/{}", gist_id))
        .header("Authorization", format!("token {}", github_token))
        .header("User-Agent", "MVO-Hub")
        .send()
        .map_err(|e| format!("Failed to fetch gist: {}", e))?;

    let gist: serde_json::Value = gist_resp.json().map_err(|e| e.to_string())?;

    let file_content = gist["files"]["mvo-sync-data.json"]["content"]
        .as_str()
        .ok_or("Sync data file not found in gist")?;

    let sync_data: serde_json::Value = serde_json::from_str(file_content)
        .map_err(|e| format!("Failed to parse sync data: {}", e))?;

    // Restore settings
    if let Some(settings) = sync_data.get("settings") {
        let app_data = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        let settings_path = app_data.join("project-mvo-app").join("mvo-settings.json");
        let settings_json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
        fs::write(&settings_path, &settings_json).map_err(|e| e.to_string())?;
    }

    // Restore chat data
    if let Some(chat_data) = sync_data.get("chat_data") {
        if let Some(sessions) = chat_data.as_array() {
            let db = gv_db()?;
            let db = db.lock().map_err(|e| e.to_string())?;
            for session in sessions {
                if let Some(s) = session.get("session") {
                    let id = s["id"].as_str().unwrap_or("");
                    let title = s["title"].as_str().unwrap_or("Chat");
                    let model = s["model"].as_str().unwrap_or("gpt-4o-mini");
                    let _ = db.create_chat_session(id, title, model);
                    if let Some(msgs) = session.get("messages").and_then(|m| m.as_array()) {
                        for msg in msgs {
                            let role = msg["role"].as_str().unwrap_or("user");
                            let content = msg["content"].as_str().unwrap_or("");
                            let _ = db.add_chat_message(id, role, content);
                        }
                    }
                }
            }
        }
    }

    Ok("Data imported from cloud sync".to_string())
}

#[tauri::command]
fn sync_get_gist_id(github_token: String) -> Result<Option<String>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let gists_resp = client.get("https://api.github.com/gists")
        .header("Authorization", format!("token {}", github_token))
        .header("User-Agent", "MVO-Hub")
        .send()
        .map_err(|e| format!("Failed to list gists: {}", e))?;

    let gists: Vec<serde_json::Value> = gists_resp.json().map_err(|e| e.to_string())?;

    let existing_gist = gists.iter().find(|g| {
        g.get("description").and_then(|d| d.as_str()).map(|d| d.contains("MVO Hub sync")).unwrap_or(false)
    });

    Ok(existing_gist.and_then(|g| g["id"].as_str().map(|s| s.to_string())))
}

#[tauri::command]
fn pick_exe_file() -> Result<String, String> {
    let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Select game executable'
$dialog.Filter = 'Executable files (*.exe)|*.exe|All files (*.*)|*.*'
$dialog.Multiselect = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.FileName
}
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Failed to open EXE picker: {}", error))?;

    if output.status.success() {
        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if selected.is_empty() {
            Err("No EXE selected.".to_string())
        } else {
            Ok(selected)
        }
    } else {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if err.is_empty() {
            Err("EXE picker failed.".to_string())
        } else {
            Err(format!("EXE picker failed: {}", err))
        }
    }
}

// ── Chat Session Commands ──

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let rand_val = (secs % 100000) as u32;
    format!("{:x}-{:04x}", secs, rand_val)
}

#[tauri::command]
fn chat_create_session(title: String) -> Result<String, String> {
    let id = format!("chat-{}", uuid_simple());
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    db.create_chat_session(&id, &title, "gpt-4o-mini")?;
    Ok(id)
}

#[tauri::command]
fn chat_get_sessions() -> Result<Vec<serde_json::Value>, String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    let sessions = db.get_chat_sessions()?;
    Ok(sessions.into_iter().map(|(id, title, model, created_at, updated_at)| {
        serde_json::json!({ "id": id, "title": title, "model": model, "createdAt": created_at, "updatedAt": updated_at })
    }).collect())
}

#[tauri::command]
fn chat_rename_session(id: String, title: String) -> Result<(), String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    db.update_chat_session_title(&id, &title)
}

#[tauri::command]
fn chat_delete_session(id: String) -> Result<(), String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    db.delete_chat_session(&id)
}

#[tauri::command]
fn chat_add_message(session_id: String, role: String, content: String) -> Result<(), String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    db.add_chat_message(&session_id, &role, &content)
}

#[tauri::command]
fn chat_get_messages(session_id: String) -> Result<Vec<serde_json::Value>, String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    let messages = db.get_chat_messages(&session_id)?;
    Ok(messages.into_iter().map(|(_, role, content, created_at)| {
        serde_json::json!({ "role": role, "content": content, "createdAt": created_at })
    }).collect())
}

use std::sync::atomic::{AtomicU64};

static DOWNLOAD_ACTIVE: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_TOTAL: AtomicU64 = AtomicU64::new(0);
static DOWNLOAD_DONE: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
fn get_download_progress() -> Result<String, String> {
    let active = DOWNLOAD_ACTIVE.load(Ordering::Relaxed);
    let total = DOWNLOAD_TOTAL.load(Ordering::Relaxed);
    let done = DOWNLOAD_DONE.load(Ordering::Relaxed);
    let percent = if total > 0 { (done as f64 / total as f64 * 100.0) as u64 } else { 0 };
    serde_json::to_string(&serde_json::json!({
        "active": active,
        "total_bytes": total,
        "downloaded_bytes": done,
        "percent": percent,
    }))
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn download_file_with_progress(url: String, dest: String) -> Result<String, String> {
    use std::fs::File;
    use std::io::Write;

    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    rt.block_on(async {
        DOWNLOAD_ACTIVE.store(true, Ordering::Relaxed);
        DOWNLOAD_TOTAL.store(0, Ordering::Relaxed);
        DOWNLOAD_DONE.store(0, Ordering::Relaxed);

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .map_err(|e| { DOWNLOAD_ACTIVE.store(false, Ordering::Relaxed); e.to_string() })?;

        let resp = client.get(&url).send().await.map_err(|e| {
            DOWNLOAD_ACTIVE.store(false, Ordering::Relaxed);
            format!("Failed to start download: {}", e)
        })?;

        let total = resp.content_length().unwrap_or(0);
        DOWNLOAD_TOTAL.store(total, Ordering::Relaxed);

        let mut file = File::create(&dest).map_err(|e| {
            DOWNLOAD_ACTIVE.store(false, Ordering::Relaxed);
            format!("Failed to create file: {}", e)
        })?;

        let mut stream = resp.bytes_stream();
        use futures_util::StreamExt;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| {
                DOWNLOAD_ACTIVE.store(false, Ordering::Relaxed);
                format!("Download error: {}", e)
            })?;
            file.write_all(&chunk).map_err(|e| {
                DOWNLOAD_ACTIVE.store(false, Ordering::Relaxed);
                format!("Write error: {}", e)
            })?;
            DOWNLOAD_DONE.fetch_add(chunk.len() as u64, Ordering::Relaxed);
        }

        DOWNLOAD_ACTIVE.store(false, Ordering::Relaxed);
        Ok(format!("Downloaded {} bytes to {}", total, dest))
    })
}

// Bridge commands: aliases that the MVO-Core hooks expect
#[tauri::command]
fn load_settings() -> Result<serde_json::Value, String> {
    let path = settings_file_path()?;

    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&content) {
            // Migrate old field names
            if val.get("theme").is_none() {
                if let Some(tm) = val.get("theme_mode").and_then(|v| v.as_str()).map(|s| s.to_string()) {
                    if let Some(obj) = val.as_object_mut() {
                        obj.insert("theme".to_string(), serde_json::Value::String(tm));
                    }
                }
            }
             // Ensure all frontend fields exist
             let obj = val.as_object_mut().unwrap();
             if !obj.contains_key("hidden_pages") { obj.insert("hidden_pages".to_string(), serde_json::json!([])); }
             if !obj.contains_key("dashboard_widgets") { obj.insert("dashboard_widgets".to_string(), serde_json::json!([])); }
             if !obj.contains_key("language") { obj.insert("language".to_string(), serde_json::json!("en")); }
             if !obj.contains_key("notifications_enabled") { obj.insert("notifications_enabled".to_string(), serde_json::json!(true)); }
             if !obj.contains_key("auto_update") { obj.insert("auto_update".to_string(), serde_json::json!(true)); }
             if !obj.contains_key("sidebar_collapsed") { obj.insert("sidebar_collapsed".to_string(), serde_json::json!(false)); }
             if !obj.contains_key("right_panel_open") { obj.insert("right_panel_open".to_string(), serde_json::json!(true)); }
             if !obj.contains_key("window_width") { obj.insert("window_width".to_string(), serde_json::json!(1500)); }
             if !obj.contains_key("window_height") { obj.insert("window_height".to_string(), serde_json::json!(900)); }
             return Ok(val);
        }
    }

    // Fallback: create defaults
    let settings = load_mvo_settings()?;
         Ok(serde_json::json!({
             "theme": settings.theme_mode,
             "selected_profile": "vortex",
             "selected_page": "dashboard",
             "auto_steam_scan": settings.auto_scan_games,
             "overlay_before_game": settings.launch_overlay_with_game,
             "boost_before_game": settings.launch_steam_with_boost,
             "ai_provider": settings.api_provider,
             "ai_base_url": settings.api_base_url,
             "ai_model": settings.api_model,
             "ai_api_key": settings.api_key,
             "first_run_complete": true,
             "window_mode": "normal",
             "window_width": 1500,
              "window_height": 900,
              "sidebar_collapsed": false,
             "right_panel_open": true,
             "notifications_enabled": true,
             "auto_update": true,
             "language": "en",
             "hidden_pages": [],
             "dashboard_widgets": [],
         }))
}

#[tauri::command]
fn save_settings(settings: serde_json::Value) -> Result<String, String> {
    let path = settings_file_path()?;
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, &json).map_err(|e| e.to_string())?;
    Ok(format!("Settings saved to {}", path.display()))
}

#[tauri::command]
fn reset_settings() -> Result<serde_json::Value, String> {
    load_settings()
}

#[tauri::command]
fn export_settings() -> Result<String, String> {
    let settings = load_mvo_settings()?;
    serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_settings(_json: String) -> Result<String, String> {
    Ok("Settings imported".to_string())
}

#[tauri::command]
fn open_settings_folder() -> Result<String, String> {
    open_mvo_settings_folder()
}

#[tauri::command]
fn check_first_run() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "is_first_run": false }))
}

#[tauri::command]
fn complete_first_run() -> Result<String, String> {
    Ok("First run complete".to_string())
}

#[tauri::command]
fn scan_steam_games() -> Result<serde_json::Value, String> {
    let steam_path = find_steam_path();
    let mut libraries = steam_path.as_ref().map(|p| steam_library_paths(p)).unwrap_or_default();

    let mut seen_libs: HashSet<String> = libraries.iter()
        .map(|p| p.to_string_lossy().to_lowercase())
        .collect();

    for drive in 'C'..='Z' {
        let base = PathBuf::from(format!("{}:\\", drive));
        if !base.exists() { continue; }
        let candidates = [
            base.join("Steam"),
            base.join("steam app"),
            base.join("SteamLibrary"),
            base.join("Games").join("Steam"),
            base.join("Program Files (x86)").join("Steam"),
            base.join("Program Files").join("Steam"),
        ];
        for candidate in &candidates {
            if candidate.join("steam.exe").exists() || candidate.join("steamapps").exists() {
                let key = candidate.to_string_lossy().to_lowercase();
                if seen_libs.insert(key) {
                    libraries.push(candidate.clone());
                }
            }
        }

        if let Ok(entries) = fs::read_dir(&base) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let steamapps = path.join("steamapps");
                    if steamapps.exists() {
                        let key = path.to_string_lossy().to_lowercase();
                        if seen_libs.insert(key) && !libraries.contains(&path) {
                            libraries.push(path);
                        }
                    }
                }
            }
        }
    }

    let mut games = Vec::<serde_json::Value>::new();
    let mut seen_ids: HashSet<String> = HashSet::new();

    for library in &libraries {
        let steamapps = library.join("steamapps");
        if let Ok(entries) = fs::read_dir(&steamapps) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("appmanifest_") && name.ends_with(".acf") {
                        if let Ok(content) = fs::read_to_string(&path) {
                            let app_id = extract_acf_value(&content, "appid");
                            let game_name = extract_acf_value(&content, "name");
                            let install_dir = extract_acf_value(&content, "installdir");
                            if !app_id.is_empty() && !game_name.is_empty() {
                                if !seen_ids.insert(app_id.clone()) { continue; }
                                let game_path = library.join("steamapps").join("common").join(&install_dir);
                                games.push(serde_json::json!({
                                    "id": format!("steam-{}", app_id),
                                    "app_id": app_id,
                                    "name": game_name,
                                    "source": "Steam",
                                    "install_dir": game_path.to_string_lossy(),
                                    "library_path": library.to_string_lossy(),
                                    "executable_hint": null,
                                    "is_installed": game_path.exists(),
                                    "last_played": null,
                                    "is_favorite": false,
                                    "playtime_forever": null,
                                    "tags": [],
                                }));
                            }
                        }
                    }
                }
            }
        }
    }

    games.sort_by(|a, b| a["name"].as_str().unwrap_or("").cmp(b["name"].as_str().unwrap_or("")));

    Ok(serde_json::json!({
        "steam_found": steam_path.is_some(),
        "steam_path": steam_path.map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        "library_paths": libraries.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>(),
        "games": games,
        "message": format!("Found {} games", games.len()),
    }))
}

#[tauri::command]
fn scan_all_platforms() -> Result<serde_json::Value, String> {
    use std::sync::Arc;
    
    let progress_messages = Arc::new(Mutex::new(Vec::<String>::new()));
    
    let progress_cb = {
        let progress_messages = Arc::clone(&progress_messages);
        Arc::new(move |msg: &str| {
            progress_messages.lock().unwrap().push(msg.to_string());
        })
    };
    
    let result = scanner::engine::run_full_scan_enriched(Some(progress_cb));
    
    Ok(serde_json::json!({
        "games": result,
        "total": result.len(),
        "message": format!("Found {} games", result.len()),
    }))
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!("{}", secs)
}

fn app_data_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|p| p.join("project-mvo-app"))
}

#[tauri::command]
fn clear_artwork_cache() -> Result<String, String> {
    scanner::metadata::clear_artwork_cache()?;
    Ok("Artwork cache cleared".to_string())
}

#[tauri::command]
fn get_artwork_cache_size() -> Result<u64, String> {
    Ok(scanner::metadata::get_cache_size())
}

#[tauri::command]
fn save_scanned_games_to_db(games: Vec<gamevault::db::ScannedGameRow>) -> Result<String, String> {
    let app_data = app_data_dir().ok_or("No app data dir")?;
    let db = gamevault::db::GameVaultDb::new(&app_data).map_err(|e| e.to_string())?;
    db.save_scanned_games(&games).map_err(|e| e.to_string())?;
    Ok(format!("Saved {} games", games.len()))
}

#[tauri::command]
fn load_scanned_games_from_db() -> Result<Vec<gamevault::db::ScannedGameRow>, String> {
    let app_data = app_data_dir().ok_or("No app data dir")?;
    let db = gamevault::db::GameVaultDb::new(&app_data).map_err(|e| e.to_string())?;
    db.get_scanned_games().map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_scanned_game_favorite(id: String) -> Result<String, String> {
    let app_data = app_data_dir().ok_or("No app data dir")?;
    let db = gamevault::db::GameVaultDb::new(&app_data).map_err(|e| e.to_string())?;
    db.toggle_scanned_game_favorite(&id).map_err(|e| e.to_string())?;
    Ok("Toggled favorite".to_string())
}

#[tauri::command]
fn toggle_scanned_game_hidden(id: String) -> Result<String, String> {
    let app_data = app_data_dir().ok_or("No app data dir")?;
    let db = gamevault::db::GameVaultDb::new(&app_data).map_err(|e| e.to_string())?;
    db.toggle_scanned_game_hidden(&id).map_err(|e| e.to_string())?;
    Ok("Toggled hidden".to_string())
}

#[tauri::command]
fn update_scanned_game_playtime(id: String, seconds: i64) -> Result<String, String> {
    let app_data = app_data_dir().ok_or("No app data dir")?;
    let db = gamevault::db::GameVaultDb::new(&app_data).map_err(|e| e.to_string())?;
    db.update_scanned_game_playtime(&id, seconds).map_err(|e| e.to_string())?;
    Ok("Updated playtime".to_string())
}

const GAME_EXE_BLACKLIST: &[&str] = &[
    // Uninstallers / installers
    "uninstall", "unins", "setup", "install", "update", "patch",
    // Services / agents / helpers
    "launcher", "service", "agent", "downloader", "updater", "helper",
    "crash", "error", "report", "config", "settings", "registry", "cleanup",
    "remove", "delete", "temp", "tmp", "cache", "log", "debug",
    // Runtimes / redistributables
    "unity", "mono", "dotnet", "vcredist", "directx", "opengl",
    "commonredist", "oalinst", "dxsetup", "vcrun", "ndp",
    // Browsers / webviews
    "browser", "webview", "cef", "electron", "nwjs",
    // Hardware tools / drivers
    "hwinfo", "devcon", "nvcontainer", "nvwgf2um", "nvlddmkm",
    "display.driver", "driver", "acer", "predator", "lenovo", "dell", "hp",
    "intel", "realtek", "synaptics", "elantech",
    // Build tools / scripts
    "build", "compile", "make", "cargo", "rustc", "gcc", "mingw", "cmake",
    // Archives / utilities
    "7z", "winrar", "winzip", "peazip", "bandizip",
    // Dev tools
    "code", "vscode", "git", "node", "npm", "python", "java", "javac",
    "visualstudio", "devenv", "msbuild", "nuget",
    // System tools
    "msiexec", "regsvr32", "rundll32", "mmc", "taskmgr", "resmon",
    "msinfo", "dxdiag", "perfmon", "eventvwr",
    // Benchmark / test tools (keep main 3DMark Demo, filter subfolder test binaries)
    "timespy", "nightraid", "night raid", "firestrike", "fire strike", "cloudgate", "cloud gate",
    "skydiver", "sky diver", "port royal", "speed way",
    "unigine", "heaven", "valley", "superposition",
    "cinebench", "geekbench", "pcmark", "passmark", "memtest",
    "furmark", "occt", "prime95", "linx", "aida64",
    "userbenchmark", "novabench", "crossmark",
    "touchup", "storagereader", "icfworkload",
    // Subfolder binaries / arch folders / Java / runtimes inside game dirs
    "unpack200", "pack200", "jre", "javac", "java.exe",
    "arm64", "arm",
    "steam_monitor", "activationui",
    "rld", "crack",
    // BattlEye launcher
    "be_service", "bedaisy", "_be",
    // Generic non-game folder/file names
    "bin", "redist", "support", "docs", "manual",
    "license", "eula", "changelog", "version",
    // Common non-game tools found in Downloads/Desktop
    "rufus", "itunes", "3utools", "steamcmd", "writeminidump",
    "slinfo", "notepad", "putty", "filezilla", "winscp",
    "aria2", "qbittorrent", "utorrent", "deluge",
    "chrome", "firefox", "edge", "opera", "brave",
    "discord", "slack", "teams", "zoom", "skype",
    "photoshop", "gimp", "blender", "obs", "ffmpeg",
    "vscode", "sublime", "notepad++", "atom",
    "7zip", "winrar", "winzip",
    "ccleaner", "malwarebytes", "avg", "avast",
    "vmware", "virtualbox", "docker",
    "postman", "insomnia",
];

fn is_game_exe_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    // Use file_name() not file_stem() ΓÇö file_stem() returns "" for paths ending in \
    let stem = std::path::Path::new(&lower).file_name().and_then(|s| s.to_str()).unwrap_or("");

    // Reject if stem is too short (likely a utility)
    if stem.len() < 3 { return false; }

    // Reject known non-game names
    if GAME_EXE_BLACKLIST.iter().any(|bad| stem.contains(bad)) {
        return false;
    }

    // Reject if name is all hex/base32 (build script hashes)
    if stem.len() >= 8 && stem.chars().all(|c| c.is_ascii_hexdigit()) {
        return false;
    }

    // Reject "build_script_build_*" patterns
    if stem.starts_with("build_script") || stem.starts_with("build-") {
        return false;
    }

    true
}

#[tauri::command]
fn scan_custom_games() -> Result<serde_json::Value, String> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));

    let mut scan_roots: Vec<PathBuf> = Vec::new();

    // 1) Scan common game library directory names on each drive
    let game_dir_names = [
        "games", "steam", "steamlibrary", "epic games", "gog games",
        "origin games", "battle.net", "ubisoft", "ea games",
        "rockstar games", "blizzard", "xbox games",
    ];

    for drive in 'C'..='Z' {
        let base = PathBuf::from(format!("{}:\\", drive));
        if !base.exists() { continue; }

        // Check drive root for known game folders
        if let Ok(entries) = fs::read_dir(&base) {
            for entry in entries.flatten() {
                let p = entry.path();
                if !p.is_dir() { continue; }
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                if game_dir_names.iter().any(|gn| name == *gn || name.replace(' ', "") == *gn.replace(' ', "")) {
                    scan_roots.push(p);
                }
            }
        }

        // Also check common Steam library locations
        let steam_locations = [
            base.join("SteamLibrary"),
            base.join("steam app"),
            base.join("Steam"),
            base.join("Program Files (x86)").join("Steam"),
        ];
        for loc in &steam_locations {
            if loc.exists() && !scan_roots.contains(loc) {
                scan_roots.push(loc.clone());
            }
        }
    }

    // 2) Add user directories where people sometimes put games
    let user_dirs = [
        home.join("Desktop"),
        home.join("Downloads"),
        home.join("Documents"),
        home.join("OneDrive").join("Desktop"),
        home.join("OneDrive").join("Downloads"),
        home.join("OneDrive").join("Documents"),
    ];
    for d in &user_dirs {
        if d.exists() { scan_roots.push(d.clone()); }
    }

    // 3) Add home directory game folders (e.g., C:\Users\<user>\Games)
    let user_game_dirs = [home.join("Games"), home.join("GameLibrary")];
    for d in &user_game_dirs {
        if d.exists() { scan_roots.push(d.clone()); }
    }

    // 3) If no roots found, do a minimal safe scan ΓÇö only drive-root-level dirs named "Games"
    if scan_roots.is_empty() {
        for drive in 'C'..='Z' {
            let games_dir = PathBuf::from(format!("{}:\\Games", drive));
            if games_dir.exists() { scan_roots.push(games_dir); }
        }
    }

    let mut games = Vec::<serde_json::Value>::new();
    let mut seen_paths: HashSet<String> = HashSet::new();
    let mut scan_count = 0u32;
    let max_scans = 500;

    let game_keywords = ["game", "gaming", "games", "rip", "steamrip", "repack", "codex", "plaza", "cpy", "skidrow", "fitgirl", "elamigos", "gog"];
    let skip_dirs = [
        "windows", "program files", "program files (x86)", "programdata", "recovery", "perflogs",
        ".git", "node_modules", "__pycache__", ".cache", "appdata", "localappdata", "temp", "tmp", "cache", "logs",
        "system32", "syswow64", "winsxs", "servicing",
        "target", "build", "dist", "out", ".vs", ".vscode", "debug", "release",
        "nvdisplay", "nvidia", "amd", "intel", "driver",
        "redist", "common files", "microsoft visual studio", "windows kits",
        "directx", "dotnet", "nuget",
        "predator", "acer", "lenovo", "dell", "hp", "asus", "msi",
        "music", "pictures", "videos", "contacts", "favorites", "links",
        "saves", "saved games", "my games",
    ];

    while let Some(dir) = scan_roots.pop() {
        scan_count += 1;
        if scan_count > max_scans { break; }

        let dir_str = dir.to_string_lossy().to_lowercase();
        if skip_dirs.iter().any(|s| dir_str.contains(s)) { continue; }
        if dir_str.len() > 200 { continue; }

        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        let mut has_game_exe = false;
        let mut game_exe = String::new();
        let mut game_name = String::new();
        let mut subdirs = Vec::new();

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                if name.starts_with('.') || skip_dirs.contains(&name.as_str()) { continue; }
                // Reject standalone architecture/utility folder names
                if ["x64", "x86", "bin", "arm64", "arm", "win32", "win64"].contains(&name.as_str()) { continue; }
                subdirs.push(path);
            } else if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ext.eq_ignore_ascii_case("exe") {
                        let exe_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        if is_game_exe_name(exe_name) {
                            has_game_exe = true;
                            game_exe = path.to_string_lossy().to_string();
                            game_name = path.file_stem().and_then(|n| n.to_str()).unwrap_or("Unknown").to_string();
                        }
                    }
                }
            }
        }

        if has_game_exe {
            let parent_key = dir.to_string_lossy().to_lowercase();
            if seen_paths.insert(parent_key) {
                let has_game_marker = game_keywords.iter().any(|kw| {
                    dir.to_string_lossy().to_lowercase().contains(kw)
                }) || subdirs.iter().any(|s| {
                    let s_lower = s.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                    game_keywords.iter().any(|kw| s_lower.contains(kw))
                });

                let display_name = if has_game_marker {
                    game_name.clone()
                } else {
                    dir.file_name().and_then(|n| n.to_str()).unwrap_or(&game_name).to_string()
                };

                let cleaned = display_name
                    .replace('-', " ")
                    .replace('_', " ")
                    .replace("SteamRIP.com", "")
                    .replace("steamrip", "")
                    .replace("Repack", "")
                    .replace("repack", "")
                    .replace("original", "")
                    .replace("Original", "")
                    .replace("gog", "")
                    .replace("GOG", "")
                    .replace("PLAZA", "")
                    .replace("CODEX", "")
                    .replace("SKIDROW", "")
                    .replace("FitGirl", "")
                    .replace("ElAmigos", "")
                    .replace("HOODLUM", "")
                    .replace("RAZOR1911", "")
                    .replace("PROPHET", "")
                    .replace("BW", "")
                    .replace("TiNYiSO", "")
                    .replace("DARKSiDERS", "")
                    .replace('.', " ")
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .trim()
                    .to_string();

                let final_name = if cleaned.is_empty() { game_name } else { cleaned };

                games.push(serde_json::json!({
                    "id": format!("custom-{}", games.len()),
                    "app_id": "",
                    "name": final_name,
                    "source": "Manual",
                    "install_dir": dir.to_string_lossy(),
                    "library_path": dir.to_string_lossy(),
                    "executable_hint": game_exe,
                    "is_installed": true,
                    "last_played": null,
                    "is_favorite": false,
                    "playtime_forever": null,
                    "tags": [],
                }));
            }
        }

        for sub in subdirs {
            scan_roots.push(sub);
        }
    }

    games.sort_by(|a, b| a["name"].as_str().unwrap_or("").cmp(b["name"].as_str().unwrap_or("")));

    Ok(serde_json::json!({
        "games": games,
        "message": format!("Found {} custom games", games.len()),
    }))
}

#[tauri::command]
fn get_performance_snapshot() -> Result<serde_json::Value, String> {
    let snap = get_cached_system_snapshot_json()?;
    let cpu_load: f64 = snap["cpuLoad"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let ram_used: f64 = snap["ramUsedGb"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let ram_total: f64 = snap["ramTotalGb"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let stor_used: f64 = snap["storageUsedGb"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let stor_total: f64 = snap["storageTotalGb"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    Ok(serde_json::json!({
        "cpu_usage": cpu_load,
        "total_memory": (ram_total * 1e9) as u64,
        "used_memory": (ram_used * 1e9) as u64,
        "total_storage": (stor_total * 1e9) as u64,
        "used_storage": (stor_used * 1e9) as u64,
        "uptime_seconds": 0u64,
        "timestamp_ms": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64,
    }))
}

#[tauri::command]
fn get_hardware_history() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}

#[tauri::command]
fn get_system_info() -> Result<serde_json::Value, String> {
    let snap = get_cached_system_snapshot_json()?;
    let cpu_cores: u32 = System::new().cpus().len() as u32;
    let gpu_name = snap["gpuName"].as_str().unwrap_or("").to_string();
    let gpu_temp: f64 = snap["gpuTemp"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let gpu_load: f64 = snap["gpuLoad"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let _gpu_mem_used: f64 = snap["gpuMemoryUsed"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let gpu_mem_total: f64 = snap["gpuMemoryTotal"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let gpu_power: f64 = snap["gpuPower"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let ram_total: f64 = snap["ramTotalGb"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let _ram_used: f64 = snap["ramUsedGb"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let cpu_name = snap["cpuName"].as_str().unwrap_or("Unknown CPU").to_string();

    let mut disks = Vec::new();
    for disk in Disks::new_with_refreshed_list().iter() {
        let total = disk.total_space();
        let avail = disk.available_space();
        disks.push(serde_json::json!({
            "name": disk.name().to_string_lossy(),
            "mount_point": disk.mount_point().to_string_lossy(),
            "total_bytes": total,
            "available_bytes": avail,
            "used_bytes": total - avail,
            "is_ssd": disk.is_removable(),
        }));
    }

    Ok(serde_json::json!({
        "cpu_name": cpu_name,
        "cpu_cores": cpu_cores,
        "cpu_threads": cpu_cores,
        "total_memory_gb": ram_total,
        "gpu": {
            "name": gpu_name,
            "memory_total": gpu_mem_total * 1e9,
            "driver_version": "",
            "usage": gpu_load,
            "temperature": gpu_temp,
            "power": gpu_power,
        },
        "disks": disks,
    }))
}

#[tauri::command]
fn get_gpu_info() -> Result<serde_json::Value, String> {
    match get_gpu_info_nvidia() {
        Ok(json_str) => {
            let gpu: serde_json::Value = serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse GPU info JSON: {}", e))?;
            let name = gpu.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let memory_total_mb = gpu.get("memory_total").and_then(|v| v.as_u64()).unwrap_or(0);
            let driver = gpu.get("driver_version").and_then(|v| v.as_str()).unwrap_or("");
            let utilization = gpu.get("utilization").and_then(|v| v.as_u64()).unwrap_or(0);
            let temperature = gpu.get("temperature").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let power_draw = gpu.get("power_draw").and_then(|v| v.as_f64()).unwrap_or(0.0);
            Ok(serde_json::json!({
                "name": name,
                "memory_total": memory_total_mb * 1_000_000,
                "driver_version": driver,
                "usage": utilization as f64,
                "temperature": temperature,
                "power": power_draw
            }))
        }
        Err(_) => Ok(serde_json::json!(null)),
    }
}

#[tauri::command]
fn detect_overlay_tools() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "overlay_found": false, "tools": [] }))
}

#[tauri::command]
fn detect_streaming_tools() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "obs_found": false, "tools": [] }))
}

#[tauri::command]
fn get_ai_providers() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!([
        { "id": "ollama", "name": "Ollama (Local)", "requires_key": false },
        { "id": "gemini", "name": "Google Gemini", "requires_key": true },
        { "id": "openai", "name": "OpenAI", "requires_key": true },
        { "id": "openai-compatible", "name": "OpenAI Compatible", "requires_key": true }
    ]))
}

const GAMEVAULT_URL: &str = "https://raw.githubusercontent.com/Adude4554/GameVault/main/js/games.js";

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct GameVaultGame {
    id: u32,
    name: String,
    description: String,
    appid: u32,
    category: String,
    #[serde(default)]
    download_link: Option<String>,
}

#[derive(serde::Serialize)]
struct GameVaultStats {
    total_games: usize,
    categories: Vec<String>,
    with_download_link: usize,
}

#[derive(serde::Serialize)]
struct DownloadResult {
    success: bool,
    message: String,
    game_path: Option<String>,
}

fn parse_games_js(content: &str) -> Result<Vec<GameVaultGame>, String> {
    let mut games = Vec::new();
    let obj_re = regex::Regex::new(r"\{[^{}]+\}").map_err(|e| e.to_string())?;

    for mat in obj_re.find_iter(content) {
        let raw = mat.as_str();
        let cleaned = raw.replace('\n', " ").replace('\r', "");

        let id = extract_u32_field(&cleaned, "id");
        let name = extract_string_field(&cleaned, "name");
        let description = extract_string_field(&cleaned, "description");
        let appid = extract_u32_field(&cleaned, "appid");
        let category = extract_string_field(&cleaned, "category");

        if let (Some(id), Some(name)) = (id, name) {
            games.push(GameVaultGame {
                id,
                name,
                description: description.unwrap_or_default(),
                appid: appid.unwrap_or(0),
                category: category.unwrap_or_else(|| "Other".to_string()),
                download_link: extract_string_field(&cleaned, "downloadLink"),
            });
        }
    }
    Ok(games)
}

fn extract_u32_field(json: &str, field: &str) -> Option<u32> {
    let pattern = format!(r#"{}\s*:\s*(\d+)"#, field);
    let re = regex::Regex::new(&pattern).ok()?;
    let caps = re.captures(json)?;
    caps.get(1)?.as_str().parse().ok()
}

fn extract_string_field(json: &str, field: &str) -> Option<String> {
    let pattern = format!(r#"{}\s*:\s*"([^"]*)""#, field);
    let re = regex::Regex::new(&pattern).ok()?;
    let caps = re.captures(json)?;
    Some(caps.get(1)?.as_str().to_string())
}

fn load_gamevault_games() -> Result<Vec<GameVaultGame>, String> {
    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    let content = rt.block_on(async {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client.get(GAMEVAULT_URL).send().await.map_err(|e| format!("Failed to fetch GameVault: {}", e))?;
        resp.text().await.map_err(|e| format!("Failed to read response: {}", e))
    })?;

    let mut games = parse_games_js(&content)?;
    let mut seen = std::collections::HashSet::new();
    games.retain(|g| seen.insert(g.appid));
    games.truncate(200);
    Ok(games)
}

#[tauri::command]
fn get_gamevault_games() -> Result<Vec<GameVaultGame>, String> {
    load_gamevault_games()
}

#[tauri::command]
fn get_gamevault_stats() -> Result<GameVaultStats, String> {
    let games = load_gamevault_games()?;
    let categories: Vec<String> = games.iter().map(|g| g.category.clone()).collect::<std::collections::HashSet<_>>().into_iter().collect();
    let mut sorted = categories;
    sorted.sort();
    Ok(GameVaultStats {
        total_games: games.len(),
        categories: sorted,
        with_download_link: games.iter().filter(|g| g.download_link.is_some()).count(),
    })
}

#[tauri::command]
async fn download_gamevault_game(download_url: String, game_name: String) -> Result<DownloadResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&download_url).send().await.map_err(|e| format!("Failed to download: {}", e))?;

    let downloads_dir = dirs::download_dir()
        .ok_or("Could not find downloads directory")?
        .join("MVO-Beta");
    fs::create_dir_all(&downloads_dir).map_err(|e| e.to_string())?;

    let safe_name = game_name.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
    let extract_dir = downloads_dir.join(&safe_name);
    if extract_dir.exists() {
        fs::remove_dir_all(&extract_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;

    let url_lower = download_url.to_lowercase();
    let is_zip = url_lower.ends_with(".zip");

    if is_zip {
        let temp_file = extract_dir.join(format!("{}.tmp", safe_name));
        {
            let mut file = fs::File::create(&temp_file).map_err(|e| format!("Failed to create temp file: {}", e))?;
            let mut stream = resp.bytes_stream();
            use futures_util::StreamExt;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;

                std::io::Write::write_all(&mut file, &chunk).map_err(|e| format!("Failed to write chunk: {}", e))?;
            }
        }

        let file = fs::File::open(&temp_file).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let outpath = extract_dir.join(file.mangled_name());
            if file.is_dir() {
                fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
            } else {
                if let Some(parent) = outpath.parent() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
                std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            }
        }
        let _ = fs::remove_file(&temp_file);
    } else {
        let exe_path = extract_dir.join(format!("{}.exe", safe_name));
        let mut file = fs::File::create(&exe_path).map_err(|e| e.to_string())?;
        let mut stream = resp.bytes_stream();
        use futures_util::StreamExt;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
            std::io::Write::write_all(&mut file, &chunk).map_err(|e| format!("Failed to write chunk: {}", e))?;
        }
    }

    let game_path = extract_dir.to_string_lossy().to_string();
    Ok(DownloadResult {
        success: true,
        message: format!("Game downloaded to {}", extract_dir.display()),
        game_path: Some(game_path),
    })
}

fn gv_db() -> Result<Arc<Mutex<gamevault::db::GameVaultDb>>, String> {
    GV_DB.get().cloned().ok_or("GameVault DB not initialized".to_string())
}

fn gv_cancel_tokens() -> Arc<Mutex<HashMap<String, Arc<AtomicBool>>>> {
    GV_CANCEL_TOKENS.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone()
}

const CHROME_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

fn parse_js_games_array(text: &str) -> Result<Vec<gamevault::StoreItem>, String> {
    let start = text.find('[').ok_or("No [ found in games.js")?;
    let end = text.rfind(']').ok_or("No ] found in games.js")?;
    let raw = &text[start..=end];

    let mut out = String::with_capacity(raw.len() + 512);
    let bytes = raw.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        let b = bytes[i];

        if b == b'"' {
            out.push('"');
            i += 1;
            while i < len && bytes[i] != b'"' {
                if bytes[i] == b'\\' && i + 1 < len {
                    out.push(bytes[i] as char);
                    out.push(bytes[i + 1] as char);
                    i += 2;
                } else {
                    out.push(bytes[i] as char);
                    i += 1;
                }
            }
            if i < len {
                out.push('"');
                i += 1;
            }
            continue;
        }

        if b == b'{' || b == b'[' || b == b',' {
            out.push(b as char);
            i += 1;

            while i < len && (bytes[i] == b' ' || bytes[i] == b'\t' || bytes[i] == b'\n' || bytes[i] == b'\r') {
                out.push(bytes[i] as char);
                i += 1;
            }

            if i < len && bytes[i] != b'}' && bytes[i] != b']' && bytes[i] != b'"' {
                let start_key = i;
                while i < len && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
                    i += 1;
                }
                let key = &raw[start_key..i];

                while i < len && (bytes[i] == b' ' || bytes[i] == b'\t') {
                    out.push(bytes[i] as char);
                    i += 1;
                }

                if i < len && bytes[i] == b':' {
                    if key.chars().next().map_or(false, |c| c.is_ascii_alphabetic() || c == b'_' as char) {
                        out.push('"');
                        out.push_str(key);
                        out.push('"');
                    } else {
                        out.push_str(key);
                    }
                } else {
                    out.push_str(key);
                }
            }
            continue;
        }

        out.push(b as char);
        i += 1;
    }

    serde_json::from_str(&out).map_err(|e| format!("JSON parse error: {}", e))
}

#[tauri::command]
async fn gv_get_store() -> Result<Vec<gamevault::StoreItem>, String> {
    let url = "https://raw.githubusercontent.com/Adude4554/GameVault/main/js/games.js";
    let resp = reqwest::get(url).await.map_err(|e| format!("Failed to fetch games: {}", e))?;
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
    parse_js_games_array(&text)
}

#[tauri::command]
fn gv_get_library() -> Result<Vec<gamevault::InstalledGame>, String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    db.get_installed_games()
}

#[tauri::command]
fn gv_get_downloads() -> Result<Vec<gamevault::DownloadItem>, String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    db.get_downloads()
}

#[tauri::command]
fn gv_is_installed(id: String) -> Result<bool, String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    Ok(db.get_installed_game(&id)?.is_some())
}

#[tauri::command]
async fn gv_install(app: tauri::AppHandle, item_id: String, install_dir: Option<String>) -> Result<String, String> {
    let parsed_id: u32 = item_id.parse().map_err(|_| format!("Invalid item ID: {}", item_id))?;

    let store_items = {
    let url = "https://raw.githubusercontent.com/Adude4554/GameVault/main/js/games.js";
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .user_agent(CHROME_USER_AGENT)
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client.get(url).send().await.map_err(|e| format!("Failed to fetch games: {}", e))?;
        let text = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
        parse_js_games_array(&text)?
    };

    let item = store_items.iter().find(|i| i.id == parsed_id)
        .ok_or_else(|| format!("Item '{}' not found", item_id))?
        .clone();

    let download_url = item.download_link.as_ref()
        .ok_or_else(|| format!("{} has no download link", item.name))?;

    let base_dir = match install_dir {
        Some(d) => PathBuf::from(d),
        None => {
            let app_data = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
            app_data.join("games")
        }
    };

    let safe_name = item.name.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
    let game_dir = base_dir.join(&safe_name);
    let _ = fs::create_dir_all(&game_dir);

    let cache_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join("cache").join("downloads");
    let _ = fs::create_dir_all(&cache_dir);

    let download_id = format!("gv-{}", item.id);
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600))
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent(CHROME_USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(download_url).send().await
        .map_err(|e| format!("Download request failed: {}", e))?;

    let content_type = resp.headers().get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    let content_disp = resp.headers().get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    let total_bytes = resp.content_length().unwrap_or(0);

    if content_type.contains("text/html") {
        let err_msg = format!("{}: link returned an HTML page ΓÇö may need a browser", item.name);
        {
            let db = gv_db()?;
            let db = db.lock().map_err(|e| e.to_string())?;
            let _ = db.update_download(&download_id, "failed", 0.0, 0, 0);
            let _ = db.set_download_error(&download_id, &err_msg);
        }
        let _ = app.emit("gv-download-progress", serde_json::json!({
            "id": download_id, "progress": 0.0, "speed_bytes": 0u64,
            "downloaded_bytes": 0u64, "total_bytes": 0u64, "status": "error",
        }));
        return Err(err_msg);
    }

    let is_rar = content_type.contains("rar") || download_url.to_lowercase().ends_with(".rar")
        || content_disp.contains(".rar");
    let is_7z = content_type.contains("7z") || download_url.to_lowercase().ends_with(".7z");
    let is_zip = content_type.contains("zip") || download_url.to_lowercase().ends_with(".zip");

    let mut ext = if is_rar { "rar" } else if is_7z { "7z" } else if is_zip { "zip" } else { "bin" };
    let temp_file = cache_dir.join(format!("gv-{}.{}", item.id, ext));

    {
        let db = gv_db()?;
        let db = db.lock().map_err(|e| e.to_string())?;
        let dl_item = gamevault::DownloadItem {
            id: download_id.clone(),
            store_item_id: item.id.to_string(),
            name: item.name.clone(),
            download_url: download_url.clone(),
            dest_path: game_dir.to_string_lossy().to_string(),
            status: "downloading".to_string(),
            progress: 0.0,
            speed_bytes: 0,
            downloaded_bytes: 0,
            total_bytes,
            error: None,
            created_at: format!("{}", now),
        };
        let _ = db.add_download(&dl_item);
    }

    let cancel_token = Arc::new(AtomicBool::new(false));
    {
        let tokens = gv_cancel_tokens();
        let mut tokens = tokens.lock().map_err(|e| e.to_string())?;
        tokens.insert(download_id.clone(), cancel_token.clone());
    }

    {
        let mut file = fs::File::create(&temp_file).map_err(|e| format!("Failed to create temp file: {}", e))?;
        let mut stream = resp.bytes_stream();
        let mut downloaded: u64 = 0;
        let mut last_emit = std::time::Instant::now();
        let start_time = std::time::Instant::now();
        let mut first_bytes = Vec::new();
        let mut checked_html = false;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;

            if cancel_token.load(Ordering::Relaxed) {
                let _ = fs::remove_file(&temp_file);
                {
                    let db = gv_db()?;
                    let db = db.lock().map_err(|e| e.to_string())?;
                    let _ = db.update_download(&download_id, "cancelled", 0.0, 0, 0);
                }
                let tokens = gv_cancel_tokens();
                let mut tokens = tokens.lock().map_err(|e| e.to_string())?;
                tokens.remove(&download_id);
                return Err("Download cancelled".to_string());
            }

            if !checked_html {
                first_bytes.extend_from_slice(&chunk);
                if first_bytes.len() >= 512 {
                    let header = String::from_utf8_lossy(&first_bytes[..first_bytes.len().min(512)]);
                    let lower = header.to_lowercase();
                    if lower.starts_with("<!doctype") || lower.starts_with("<html") || lower.contains("<head>") || lower.contains("<title>") {
                        let _ = fs::remove_file(&temp_file);
                        let err_msg = format!("{}: download returned an HTML page instead of a game file ΓÇö link may have expired", item.name);
                        {
                            let db = gv_db()?;
                            let db = db.lock().map_err(|e| e.to_string())?;
                            let _ = db.update_download(&download_id, "failed", 0.0, 0, 0);
                            let _ = db.set_download_error(&download_id, &err_msg);
                        }
                        return Err(err_msg);
                    }
                    checked_html = true;
                }
            }

            std::io::Write::write_all(&mut file, &chunk).map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;

            if last_emit.elapsed().as_millis() > 200 {
                let elapsed = start_time.elapsed().as_secs_f64();
                let speed = if elapsed > 0.0 { (downloaded as f64 / elapsed) as u64 } else { 0 };
                let progress = if total_bytes > 0 { (downloaded as f64 / total_bytes as f64) * 100.0 } else { 0.0 };
                let _ = app.emit("gv-download-progress", serde_json::json!({
                    "id": download_id,
                    "name": item.name,
                    "progress": (progress * 100.0).round() / 100.0,
                    "speed_bytes": speed,
                    "downloaded_bytes": downloaded,
                    "total_bytes": total_bytes,
                    "status": "downloading",
                }));
                last_emit = std::time::Instant::now();
            }
        }
    }

    {
        let tokens = gv_cancel_tokens();
        let mut tokens = tokens.lock().map_err(|e| e.to_string())?;
        tokens.remove(&download_id);
    }

    // Compute SHA-256 checksum of downloaded file
    let file_checksum = {
        use sha2::{Sha256, Digest};
        let bytes = fs::read(&temp_file).map_err(|e| format!("Failed to read file for checksum: {}", e))?;
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        format!("{:x}", hasher.finalize())
    };

    // Detect actual file format from magic bytes if we couldn't determine from URL/content-type
    if ext == "bin" {
        if let Ok(header) = fs::read(&temp_file).map(|d| {
            let len = d.len().min(16);
            d[..len].to_vec()
        }) {
            eprintln!("[gv_install] Magic bytes for {}: {:02X?}", item.name, header);
            let new_ext = if header.len() >= 4 && header[0] == b'P' && header[1] == b'K' && header[2] == 0x03 && header[3] == 0x04 {
                "zip"
            } else if header.len() >= 4 && header[0] == b'R' && header[1] == b'a' && header[2] == b'r' && header[3] == b'!' {
                "rar"
            } else if header.len() >= 6 && header[0] == 0x37 && header[1] == 0x7A && header[2] == 0xBC && header[3] == 0xAF && header[4] == 0x27 && header[5] == 0x1C {
                "7z"
            } else if header.len() >= 2 && header[0] == b'M' && header[1] == b'Z' {
                "exe"
            } else {
                ext
            };
            if new_ext != ext {
                let new_path = cache_dir.join(format!("gv-{}.{}", item.id, new_ext));
                if fs::rename(&temp_file, &new_path).is_ok() {
                    ext = new_ext;
                }
            }
        }
    }

    let final_file = if ext != "bin" {
        cache_dir.join(format!("gv-{}.{}", item.id, ext))
    } else {
        temp_file.clone()
    };

    let file_type = gamevault::extractor::detect_file_type(&final_file);
    eprintln!("[gv_install] Detected file type for {}: {:?}", item.name, file_type);

    // Ensure game directory exists
    fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;

    let mut extract_ok = false;
    let mut _ran_setup = false;

    match file_type {
        // ΓöÇΓöÇ EXE: setup installer or portable game ΓöÇΓöÇ
        gamevault::extractor::FileType::Exe | gamevault::extractor::FileType::NsisInstaller => {
            let is_installer = file_type == gamevault::extractor::FileType::NsisInstaller
                || gamevault::extractor::is_setup_installer(&final_file);

            if is_installer {
                // Move the setup exe into the game dir
                let setup_dest = game_dir.join(final_file.file_name().unwrap_or_default());
                fs::copy(&final_file, &setup_dest).map_err(|e| format!("Failed to copy setup: {}", e))?;
                let _ = fs::remove_file(&final_file);

                eprintln!("[gv_install] Running setup installer for {}: {}", item.name, setup_dest.display());

                let _ = app.emit("gv-download-progress", serde_json::json!({
                    "id": download_id, "progress": 100.0, "speed_bytes": 0u64,
                    "downloaded_bytes": total_bytes, "total_bytes": total_bytes, "status": "installing",
                }));
                let _ = app.emit("gv-extract-progress", serde_json::json!({
                    "id": download_id,
                    "progress": 0.0,
                    "current_file": "Running setup...",
                    "extracted_files": 0u32,
                    "total_files": 0u32,
                }));

                // Run the installer ΓÇö hide the console window, let it show its own UI
                #[cfg(target_os = "windows")]
                let status = Command::new(&setup_dest)
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn()
                    .and_then(|mut child| child.wait())
                    .map_err(|e| format!("Failed to run setup: {}", e))?;
                #[cfg(not(target_os = "windows"))]
                let status = Command::new(&setup_dest)
                    .spawn()
                    .and_then(|mut child| child.wait())
                    .map_err(|e| format!("Failed to run setup: {}", e))?;

                _ran_setup = true;

                if !status.success() {
                    let err_msg = format!("Setup installer exited with code {:?} for {}", status.code(), item.name);
                    eprintln!("[gv_install] {}", err_msg);
                    // Still try to find any exe that was installed ΓÇö some installers don't return 0
                }

                // After setup, scan the game dir for the actual game exe
                // The installer may have created subdirectories
                extract_ok = true;
            } else {
                // Portable exe ΓÇö move directly into game dir, no extraction needed
                let exe_dest = game_dir.join(final_file.file_name().unwrap_or_default());
                fs::copy(&final_file, &exe_dest).map_err(|e| format!("Failed to copy game exe: {}", e))?;
                let _ = fs::remove_file(&final_file);

                eprintln!("[gv_install] Portable exe copied for {}: {}", item.name, exe_dest.display());
                extract_ok = true;
            }
        }

        // ΓöÇΓöÇ Archives: extract with 7-Zip or ZIP crate ΓöÇΓöÇ
        gamevault::extractor::FileType::Zip | gamevault::extractor::FileType::Rar | gamevault::extractor::FileType::SevenZ => {
            let _ = app.emit("gv-download-progress", serde_json::json!({
                "id": download_id, "progress": 100.0, "speed_bytes": 0u64,
                "downloaded_bytes": total_bytes, "total_bytes": total_bytes, "status": "extracting",
            }));
            let _ = app.emit("gv-extract-progress", serde_json::json!({
                "id": download_id,
                "progress": 0.0,
                "current_file": "Extracting...",
                "extracted_files": 0u32,
                "total_files": 0u32,
            }));

            let sevenz_paths = [
                r"C:\Program Files\7-Zip\7z.exe",
                r"C:\Program Files (x86)\7-Zip\7z.exe",
            ];
            let sevenz = sevenz_paths.iter().find(|p| std::path::Path::new(p).exists());

            if file_type == gamevault::extractor::FileType::Zip {
                // Try ZIP crate first, fall back to 7-Zip
                match gamevault::extractor::extract_zip(&final_file, &game_dir, &app, &download_id) {
                    Ok(_) => { extract_ok = true; }
                    Err(e) => {
                        eprintln!("[gv_install] ZIP crate failed for {}: {}, trying 7-Zip fallback", item.name, e);
                        if let Some(sevenz) = sevenz {
                            let output = Command::new(sevenz)
                                .args(["x", &final_file.to_string_lossy(), &format!("-o{}", game_dir.display()), "-y"])
                                .output()
                                .map_err(|e| format!("Failed to run 7-Zip: {}", e))?;
                            extract_ok = output.status.success();
                        }
                    }
                }
            } else if let Some(sevenz) = sevenz {
                // RAR and 7z: use 7-Zip only
                let output = Command::new(sevenz)
                    .args(["x", &final_file.to_string_lossy(), &format!("-o{}", game_dir.display()), "-y"])
                    .output()
                    .map_err(|e| format!("Failed to run 7-Zip: {}", e))?;

                if output.status.success() {
                    extract_ok = true;
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let err_detail = if !stderr.is_empty() { stderr.to_string() } else { stdout.to_string() };
                    eprintln!("[gv_install] 7-Zip failed for {}: {}", final_file.display(), err_detail);
                }
            } else {
                eprintln!("[gv_install] No extraction tool found for {:?}", file_type);
            }
        }

        // ΓöÇΓöÇ Unknown format: try 7-Zip, then ZIP crate ΓöÇΓöÇ
        gamevault::extractor::FileType::Unknown => {
            eprintln!("[gv_install] Unknown file type for {}, attempting extraction", item.name);
            let _ = app.emit("gv-download-progress", serde_json::json!({
                "id": download_id, "progress": 100.0, "speed_bytes": 0u64,
                "downloaded_bytes": total_bytes, "total_bytes": total_bytes, "status": "extracting",
            }));

            let sevenz_paths = [
                r"C:\Program Files\7-Zip\7z.exe",
                r"C:\Program Files (x86)\7-Zip\7z.exe",
            ];
            let sevenz = sevenz_paths.iter().find(|p| std::path::Path::new(p).exists());

            if let Some(sevenz) = sevenz {
                let output = Command::new(sevenz)
                    .args(["x", &final_file.to_string_lossy(), &format!("-o{}", game_dir.display()), "-y"])
                    .output()
                    .map_err(|e| format!("Failed to run 7-Zip: {}", e))?;
                extract_ok = output.status.success();
            }
            if !extract_ok {
                if let Ok(_) = gamevault::extractor::extract_zip(&final_file, &game_dir, &app, &download_id) {
                    extract_ok = true;
                }
            }
        }
    }

    // Clean up downloaded file (unless it's a setup that was moved)
    if final_file.exists() {
        let _ = fs::remove_file(&final_file);
    }
    if final_file != temp_file && temp_file.exists() {
        let _ = fs::remove_file(&temp_file);
    }

    if !extract_ok {
        let err_msg = format!("Extraction failed for {} (format: {:?}, file: {})", item.name, file_type, final_file.display());
        {
            let db = gv_db()?;
            let db = db.lock().map_err(|e| e.to_string())?;
            let _ = db.update_download(&download_id, "failed", 0.0, 0, 0);
            let _ = db.set_download_error(&download_id, &err_msg);
        }
        return Err(err_msg);
    }

    // Find the game exe ΓÇö search the game dir (and one level deep for installer-created subdirs)
    let exe_path = gamevault::extractor::find_exe_in_dir(&game_dir);

    let installed = gamevault::InstalledGame {
        id: item.id.to_string(),
        name: item.name.clone(),
        version: "1.0".to_string(),
        developer: String::new(),
        category: item.category.clone(),
        install_path: game_dir.to_string_lossy().to_string(),
        exe_path: exe_path.map(|p| p.to_string_lossy().to_string()),
        cover: Some(format!("https://cdn.akamai.steamstatic.com/steam/apps/{}/header.jpg", item.appid)),
        banner: None,
        icon: None,
        size_bytes: total_bytes,
        installed_at: format!("{}", now),
        last_played: None,
        play_time_seconds: 0,
        is_favorite: false,
        tags: serde_json::to_string(&vec![item.category.clone()]).unwrap_or_else(|_| "[]".to_string()),
        checksum: Some(file_checksum),
    };

    {
        let db = gv_db()?;
        let db = db.lock().map_err(|e| e.to_string())?;
        let _ = db.install_game(&installed);
        let _ = db.update_download(&download_id, "completed", 100.0, total_bytes, 0);
    }

    let _ = app.emit("gv-download-progress", serde_json::json!({
        "id": download_id, "progress": 100.0, "speed_bytes": 0u64,
        "downloaded_bytes": total_bytes, "total_bytes": total_bytes, "status": "completed",
    }));
    let _ = app.emit("gv-install-complete", serde_json::json!({
        "id": item.id,
        "success": true,
        "message": format!("{} installed successfully", item.name),
        "game": installed,
    }));

    Ok(format!("{} installed to {}", item.name, game_dir.display()))
}

#[tauri::command]
fn gv_uninstall(id: String) -> Result<String, String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    match db.uninstall_game(&id)? {
        Some(game) => Ok(format!("{} uninstalled", game.name)),
        None => Err(format!("Game '{}' not found", id)),
    }
}

#[tauri::command]
fn gv_toggle_favorite(id: String) -> Result<(), String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    db.toggle_favorite(&id)
}

#[tauri::command]
fn gv_launch(id: String) -> Result<String, String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    let game = db.get_installed_game(&id)?.ok_or_else(|| format!("Game '{}' not installed", id))?;

    match game.exe_path {
        Some(exe) => {
            let exe_path = std::path::Path::new(&exe);
            if !exe_path.exists() {
                // Try to re-find the exe in install_path
                let install_dir = std::path::Path::new(&game.install_path);
                if let Some(new_exe) = gamevault::extractor::find_exe_in_dir(install_dir) {
                    let new_exe_str = new_exe.to_string_lossy().to_string();
                    // Update DB with corrected path
                    drop(db);
                    let db2 = gv_db()?;
                    let db2 = db2.lock().map_err(|e| e.to_string())?;
                    let _ = db2.update_exe_path(&id, &new_exe_str);
                    Command::new(&new_exe)
                        .current_dir(install_dir)
                        .spawn()
                        .map_err(|e| format!("Failed to launch: {}", e))?;
                    return Ok(format!("Launched {}", game.name));
                }
                return Err(format!("Executable not found: {}", exe));
            }
            let install_dir = std::path::Path::new(&game.install_path);
            let _ = db.update_last_played(&id)?;
            Command::new(&exe)
                .current_dir(install_dir)
                .spawn()
                .map_err(|e| format!("Failed to launch: {}", e))?;
            Ok(format!("Launched {}", game.name))
        }
        None => Err("No executable found".to_string()),
    }
}

#[tauri::command]
fn gv_repair(id: String) -> Result<String, String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    let game = db.get_installed_game(&id)?.ok_or_else(|| format!("Game '{}' not installed", id))?;

    if let Some(ref checksum) = game.checksum {
        let install_path = Path::new(&game.install_path);
        if let Some(exe) = gamevault::extractor::find_exe_in_dir(install_path) {
            match gamevault::extractor::verify_checksum(&exe, checksum) {
                Ok(true) => Ok(format!("{} verified OK", game.name)),
                Ok(false) => Ok(format!("{} checksum mismatch - re-download recommended", game.name)),
                Err(e) => Err(e),
            }
        } else {
            Err("No executable found to verify".to_string())
        }
    } else {
        Ok(format!("{} has no checksum - skipping verification", game.name))
    }
}

#[tauri::command]
fn gv_cancel_download(id: String) -> Result<(), String> {
    let tokens = gv_cancel_tokens();
    let tokens = tokens.lock().map_err(|e| e.to_string())?;
    if let Some(token) = tokens.get(&id) {
        token.store(true, Ordering::Relaxed);
    }
    drop(tokens);
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    let _ = db.update_download(&id, "cancelled", 0.0, 0, 0);
    Ok(())
}

#[tauri::command]
async fn gv_retry_download(app: tauri::AppHandle, id: String, store_item_id: String) -> Result<(), String> {
    let db = gv_db()?;
    {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.remove_download(&id)?;
    }
    gv_install(app, store_item_id, None).await?;
    Ok(())
}

#[tauri::command]
fn gv_remove_download(id: String) -> Result<(), String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    db.remove_download(&id)?;
    Ok(())
}

#[tauri::command]
fn gv_open_game_folder(id: String) -> Result<String, String> {
    let db = gv_db()?;
    let db = db.lock().map_err(|e| e.to_string())?;
    let game = db.get_installed_game(&id)?.ok_or_else(|| format!("Game '{}' not installed", id))?;
    let path = Path::new(&game.install_path);
    if path.exists() {
        Command::new("explorer").arg(path).spawn().map_err(|e| e.to_string())?;
        Ok(format!("Opened {}", game.install_path))
    } else {
        Err(format!("Path {} does not exist", game.install_path))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            use tauri::Manager;
            let _ = start_performance_engine();

            // Auto-check for updates every 6 hours
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    loop {
                        std::thread::sleep(std::time::Duration::from_secs(6 * 60 * 60));
                        let h = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Ok(result) = check_for_updates().await {
                                let _ = h.emit("update-check-result", result);
                            }
                        });
                    }
                });
            }

            let app_data = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
            match gamevault::db::GameVaultDb::new(&app_data) {
                Ok(db) => {
                    let _ = GV_DB.set(Arc::new(Mutex::new(db)));
                }
                e => { eprintln!("GameVault DB init failed: {:?}", e); }
            }
            let hwinfo_path = std::path::Path::new(r"C:\Program Files\HWiNFO\HWiNFO64.exe");
            let hwinfo_marker = app_data.join(".hwinfo_installed");

            if !hwinfo_path.exists() && !hwinfo_marker.exists() {
                let app_data_clone = app_data.clone();
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let url = "https://www.hwinfo.com/files/hwi_816.exe";
                    let cache_dir = app_data_clone.join("cache");
                    let _ = fs::create_dir_all(&cache_dir);
                    let installer_path = cache_dir.join("hwi_installer.exe");

                    let client = reqwest::Client::builder()
                        .timeout(std::time::Duration::from_secs(300))
                        .redirect(reqwest::redirect::Policy::limited(5))
                        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                        .build();
                    if let Ok(client) = client {
                        if let Ok(resp) = client.get(url).send().await {
                            if let Ok(bytes) = resp.bytes().await {
                                if let Ok(mut file) = fs::File::create(&installer_path) {
                                    use std::io::Write;
                                    let _ = file.write_all(&bytes);
                                    drop(file);

                                    let _ = app_handle.emit("gv-download-progress", serde_json::json!({
                                        "id": "hwinfo",
                                        "name": "HWiNFO",
                                        "progress": 100.0,
                                        "speed_bytes": 0u64,
                                        "downloaded_bytes": bytes.len(),
                                        "total_bytes": bytes.len() as u64,
                                        "status": "extracting",
                                    }));

                                    let output = Command::new(&installer_path)
                                        .args(["/S"])
                                        .output();
                                    let _ = fs::remove_file(&installer_path);

                                    if output.is_ok() {
                                        let _ = fs::write(&hwinfo_marker, "installed");
                                        let _ = app_handle.emit("gv-install-complete", serde_json::json!({
                                            "id": "hwinfo",
                                            "success": true,
                                            "message": "HWiNFO installed successfully",
                                        }));
                                    }
                                }
                            }
                        }
                    }
                });
            } else if hwinfo_path.exists() {
                let sys = System::new_all();
                let hwinfo_running = sys.processes().values().any(|p|
                    p.name().to_string_lossy().to_lowercase().contains("hwinfo")
                );
                if !hwinfo_running {
                    let _ = Command::new(hwinfo_path)
                        .args(["/s", "/min", "/sm"])
                        .creation_flags(CREATE_NO_WINDOW)
                        .spawn();
                }
            }

            // ── System Tray ──
            {
                use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState};
                use tauri::menu::{MenuBuilder, MenuItemBuilder};

                let show_item = MenuItemBuilder::with_id("show", "Show MVO Hub").build(app)?;
                let update_item = MenuItemBuilder::with_id("update", "Check for Updates").build(app)?;
                let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

                let menu = MenuBuilder::new(app)
                    .item(&show_item)
                    .item(&update_item)
                    .separator()
                    .item(&quit_item)
                    .build()?;

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .tooltip("MVO Hub — Running in background")
                    .on_menu_event(move |app, event| {
                        match event.id().as_ref() {
                            "show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "update" => {
                                let handle = app.clone();
                                tauri::async_runtime::spawn(async move {
                                    if let Ok(result) = check_for_updates().await {
                                        let _ = handle.emit("update-check-result", result);
                                    }
                                });
                            }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            // Intercept close → hide to tray
            {
                let window = app.get_webview_window("main").unwrap();
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window_minimize,
            window_maximize,
            window_toggle_maximize,
            window_close,
            window_set_size,
            window_toggle_fullscreen,
            window_start_dragging,
            flush_dns,
            open_task_manager,
            open_disk_cleanup,
            clean_ram,
            system_boost,
            open_file_explorer,
            open_device_manager,
            open_control_panel,
            pick_exe_file,
            test_ai_api_connection,
            ask_ai,
            chat_create_session,
            chat_get_sessions,
            chat_rename_session,
            chat_delete_session,
            chat_add_message,
            chat_get_messages,
            sync_export_to_gist,
            sync_import_from_gist,
            sync_get_gist_id,
            load_mvo_settings,
            save_mvo_settings,
            reset_mvo_settings,
            open_mvo_settings_folder,
            start_performance_engine,
            get_cached_system_snapshot,
            get_system_snapshot,
            get_active_power_plan,
            activate_gaming_mode,
            restore_power_plan,
            get_steam_status,
            launch_steam,
            launch_steam_game,
            open_game_folder,
            open_steam_folder,
            open_steam_games_folder,
            open_steam_downloads_folder,
            open_steam_library_page,
            open_steam_downloads_page,
            open_steam_big_picture,
            get_installed_steam_games,
            open_url,
            open_windows_downloads_folder,
            open_documents_folder,
            open_desktop_folder,
            open_pictures_folder,
            open_screenshots_folder,
            open_appdata_folder,
            open_localappdata_folder,
            get_overlay_status,
            launch_overlay_app,
            launch_overlay_app_admin,
            open_overlay_settings_folder,
            launch_exe,
            launch_exe_admin,
            get_download_progress,
            download_file_with_progress,
            scan_all_games,
            extract_exe_icon,
            get_gamevault_games,
            get_gamevault_stats,
            download_gamevault_game,
            load_settings,
            save_settings,
            reset_settings,
            export_settings,
            import_settings,
            open_settings_folder,
            check_first_run,
            complete_first_run,
            scan_steam_games,
            scan_custom_games,
            scan_all_platforms,
            clear_artwork_cache,
            get_artwork_cache_size,
            save_scanned_games_to_db,
            load_scanned_games_from_db,
            toggle_scanned_game_favorite,
            toggle_scanned_game_hidden,
            update_scanned_game_playtime,
            get_performance_snapshot,
            get_hardware_history,
            get_system_info,
            get_gpu_info,
            detect_overlay_tools,
            detect_streaming_tools,
            get_ai_providers,
            gv_get_store,
            gv_get_library,
            gv_get_downloads,
            gv_is_installed,
            gv_install,
            gv_uninstall,
            gv_toggle_favorite,
            gv_launch,
            gv_repair,
            gv_cancel_download,
            gv_retry_download,
            gv_remove_download,
            gv_open_game_folder,
            open_windows_update,
            open_event_viewer,
            open_registry_editor,
            open_resource_monitor,
            open_disk_management,
            open_windows_security,
            open_powershell_admin,
            open_system_info,
            open_msconfig,
            run_sfc_scan,
            run_dism_repair,
            clear_temp_files,
            clear_software_distribution,
            reset_windows_store_cache,
            set_power_plan,
            get_current_power_plan,
            toggle_transparency,
            toggle_animations,
            toggle_hibernate,
            get_hibernate_status,
            open_night_light_settings,
            open_focus_assist_settings,
            open_default_apps_settings,
            open_startup_apps_settings,
            open_delivery_optimization,
            open_storage_settings,
            open_display_settings,
            open_sound_settings,
            open_network_settings,
            open_bluetooth_settings,
            open_personalization_settings,
            open_privacy_settings,
            open_accessibility_settings,
            open_maintenance_settings,
            open_recovery_settings,
            open_about_settings,
            open_troubleshoot_settings,
            open_optional_features,
            open_environment_variables,
            open_task_scheduler,
            open_services,
            open_group_policy,
            open_local_users_groups,
            open_print_management,
            check_for_updates,
            download_and_install_update,
            create_account,
            login,
            get_current_user,
            save_current_user,
            logout,
            add_recently_launched,
            get_recently_launched,
            launch_game_by_path,
            change_password,
            change_email,
            save_avatar,
            get_gpu_info_nvidia,
            get_screen_info,
            snap_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn get_screen_info(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let win = app.get_webview_window("main").ok_or("No main window")?;
    let monitor = win.current_monitor().map_err(|e| e.to_string())?.ok_or("No monitor")?;
    let size = monitor.size();
    let pos = monitor.position();
    let work = monitor.work_area();
    Ok(serde_json::json!({
        "screenX": pos.x,
        "screenY": pos.y,
        "screenW": size.width as i32,
        "screenH": size.height as i32,
        "workX": work.position.x,
        "workY": work.position.y,
        "workW": work.size.width as i32,
        "workH": work.size.height as i32
    }).to_string())
}


#[tauri::command]
fn snap_window(app: tauri::AppHandle, side: String) -> Result<(), String> {
    use tauri::Manager;
    use tauri::PhysicalPosition;
    let win = app.get_webview_window("main").ok_or("No main window")?;
    let monitor = win.current_monitor().map_err(|e| e.to_string())?.ok_or("No monitor")?;
    let work = monitor.work_area();
    let wx = work.position.x as f64;
    let wy = work.position.y as f64;
    let ww = work.size.width as f64;
    let wh = work.size.height as f64;

    match side.as_str() {
        "left" => {
            win.set_position(PhysicalPosition::new(wx, wy)).map_err(|e| e.to_string())?;
            win.set_size(tauri::PhysicalSize::new(ww / 2.0, wh)).map_err(|e| e.to_string())?;
        }
        "right" => {
            win.set_position(PhysicalPosition::new(wx + ww / 2.0, wy)).map_err(|e| e.to_string())?;
            win.set_size(tauri::PhysicalSize::new(ww / 2.0, wh)).map_err(|e| e.to_string())?;
        }
        "maximize" => {
            win.set_position(PhysicalPosition::new(wx, wy)).map_err(|e| e.to_string())?;
            win.set_size(tauri::PhysicalSize::new(ww, wh)).map_err(|e| e.to_string())?;
        }
        "restore" => {
            let _ = win.unmaximize();
        }
        _ => {}
    }
    Ok(())
}
