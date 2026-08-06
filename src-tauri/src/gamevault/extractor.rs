use std::fs;
use std::path::{Path, PathBuf};
use zip::ZipArchive;
use serde_json::json;
use tauri::Emitter;

#[derive(Debug, Clone, PartialEq)]
pub enum FileType {
    Zip,
    Rar,
    SevenZ,
    Exe,         // standalone portable exe or setup installer
    NsisInstaller, // NSIS-based setup.exe
    Unknown,
}

pub fn detect_file_type(path: &Path) -> FileType {
    // Check magic bytes FIRST — extension may be wrong (e.g. .bin for an EXE)
    if let Ok(data) = fs::read(path) {
        let len = data.len();
        let header = &data[..len.min(512)];

        // ZIP: PK\x03\x04
        if len >= 4 && header[0] == b'P' && header[1] == b'K'
            && header[2] == 0x03 && header[3] == 0x04 {
            return FileType::Zip;
        }

        // RAR: Rar! (v4) or Rar!\x1a\x07\x01\x00 (v5)
        if len >= 7 && header[0] == b'R' && header[1] == b'a' && header[2] == b'r' && header[3] == b'!' {
            return FileType::Rar;
        }

        // 7z: 7z\xBC\xAF\x27\x1C
        if len >= 6 && header[0] == 0x37 && header[1] == 0x7a
            && header[2] == 0xBC && header[3] == 0xAF
            && header[4] == 0x27 && header[5] == 0x1C {
            return FileType::SevenZ;
        }

        // EXE/PE: MZ header (0x4D 0x5A)
        if len >= 2 && header[0] == b'M' && header[1] == b'Z' {
            // Check for NSIS installer signature
            if len > 0x100 {
                let slice = &header[0x100..];
                if slice.windows(12).any(|w| w == b"NullsoftInst") {
                    return FileType::NsisInstaller;
                }
            }
            // Check for Inno Setup
            if len >= 4 && header[0] == b'M' && header[1] == b'Z' {
                // Search for "Inno Setup" in first 512 bytes
                if len > 10 {
                    for i in 0..(len - 10) {
                        if &header[i..i+10] == b"InnoSetup" || &header[i..i+5] == b"Inno" {
                            return FileType::NsisInstaller; // Treat Inno Setup same as NSIS
                        }
                    }
                }
            }
            return FileType::Exe;
        }
    }

    // Fallback to extension if magic bytes didn't match
    let ext = path.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "zip" => FileType::Zip,
        "rar" => FileType::Rar,
        "7z" => FileType::SevenZ,
        "exe" => FileType::Exe,
        _ => FileType::Unknown,
    }
}

pub fn is_setup_installer(exe_path: &Path) -> bool {
    let name = exe_path.file_stem()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    // Check filename hints
    let hints = ["setup", "install", "uninstall", "unins", "autorun", "launcher", "original", "patch"];
    if hints.iter().any(|h| name.contains(h)) {
        return true;
    }

    // Check if it's an NSIS installer via magic bytes
    if let Ok(data) = fs::read(exe_path) {
        let len = data.len();
        let check_len = len.min(4096);
        let header = &data[..check_len];

        // NSIS: "NullsoftInst" at offset 0x100
        if len > 0x100 {
            let slice = &header[0x100..];
            if slice.windows(12).any(|w| w == b"NullsoftInst") {
                return true;
            }
        }

        // Inno Setup: search for "Inno Setup" in first 4KB
        if check_len > 10 {
            for i in 0..(check_len - 10) {
                if &header[i..i+10] == b"InnoSetup" {
                    return true;
                }
            }
        }

        // If the EXE is large (>10MB) and contains PE resources, it's likely a game installer
        // (portable game exes are usually much smaller)
        if len > 10_000_000 {
            // Check for "MZone" or other installer signatures
            if check_len > 10 {
                for i in 0..(check_len - 5) {
                    if &header[i..i+5] == b"MZone" || &header[i..i+7] == b"SetupS" {
                        return true;
                    }
                }
            }
        }
    }

    false
}

pub fn extract_zip(zip_path: &Path, dest_dir: &Path, app_handle: &tauri::AppHandle, id: &str) -> Result<Vec<String>, String> {
    let file = fs::File::open(zip_path).map_err(|e| format!("Failed to open ZIP: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Failed to read ZIP: {}", e))?;

    let total_files = archive.len() as u32;
    let mut extracted_files = Vec::new();
    let mut extracted_count: u32 = 0;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = dest_dir.join(file.mangled_name());

        let current_file = file.name().to_string();

        if file.is_dir() {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }

        extracted_count += 1;
        extracted_files.push(outpath.to_string_lossy().to_string());

        let progress = (extracted_count as f64 / total_files as f64) * 100.0;
        let _ = app_handle.emit("gv-extract-progress", json!({
            "id": id,
            "progress": (progress * 100.0).round() / 100.0,
            "current_file": current_file,
            "extracted_files": extracted_count,
            "total_files": total_files,
        }));
    }

    Ok(extracted_files)
}

pub fn find_exe_in_dir(dir: &Path) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }

    let bad_names = [
        "uninstall", "setup", "install", "unins", "update", "patch",
        "crash", "error", "report", "config", "launcher", "downloader",
        "vcredist", "vc_redist", "dotnet", "dxwebsetup", "oalinst",
        "directx", "commonredist", "redist", "setup exe",
        "unitycrashhandler", "crashhandler",
        "helper", "service", "agent", "updater",
    ];

    let mut candidates = Vec::new();

    // First pass: look in the root directory
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().eq_ignore_ascii_case("exe") {
                        let name = path.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
                        if bad_names.iter().any(|bad| name.contains(bad)) {
                            continue;
                        }
                        candidates.push((path.clone(), 0));
                    }
                }
            }
        }
    }

    // Second pass: one level deep
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Ok(sub_entries) = fs::read_dir(&path) {
                    for sub_entry in sub_entries.flatten() {
                        let sub_path = sub_entry.path();
                        if sub_path.is_file() {
                            if let Some(ext) = sub_path.extension() {
                                if ext.to_string_lossy().eq_ignore_ascii_case("exe") {
                                    let name = sub_path.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
                                    if bad_names.iter().any(|bad| name.contains(bad)) {
                                        continue;
                                    }
                                    candidates.push((sub_path, 1));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if candidates.is_empty() {
        return None;
    }

    // Sort: prefer subdirectory exes (depth 1) over root, then by name length
    // Games are usually in their own subfolder, not at the root with redists
    candidates.sort_by(|a, b| {
        // Prefer subdirectory exes (they're usually the real game)
        b.1.cmp(&a.1).then_with(|| {
            let a_name = a.0.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
            let b_name = b.0.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
            b_name.len().cmp(&a_name.len())
        })
    });

    Some(candidates[0].0.clone())
}

pub fn verify_checksum(file_path: &Path, expected: &str) -> Result<bool, String> {
    use sha2::{Sha256, Digest};

    let data = fs::read(file_path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    let result = format!("{:x}", hasher.finalize());
    Ok(result.eq_ignore_ascii_case(expected))
}
