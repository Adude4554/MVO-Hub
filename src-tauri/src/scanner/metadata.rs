use super::*;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Metadata enrichment result
#[derive(Debug, Clone)]
pub struct EnrichedGame {
    pub game: ScannedGame,
    pub cover_local: Option<String>,
    pub icon_local: Option<String>,
}

/// Cache directory for artwork
fn artwork_cache_dir() -> PathBuf {
    let base = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("project-mvo-app")
        .join("artwork_cache");
    fs::create_dir_all(&base).ok();
    base
}

/// Download a URL to a local file, return the path
async fn download_to_cache(url: &str, filename: &str) -> Option<String> {
    let cache_dir = artwork_cache_dir();
    let local_path = cache_dir.join(filename);

    // Return cached if exists
    if local_path.exists() {
        return Some(local_path.to_string_lossy().to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .ok()?;

    let resp = client.get(url).send().await.ok()?;
    let bytes = resp.bytes().await.ok()?;

    fs::write(&local_path, &bytes).ok()?;

    Some(local_path.to_string_lossy().to_string())
}

/// Synchronous download wrapper (runs async in a block_on)
fn download_to_cache_sync(url: &str, filename: &str) -> Option<String> {
    let rt = tokio::runtime::Runtime::new().ok()?;
    rt.block_on(download_to_cache(url, filename))
}

/// Get Steam header URL
fn steam_header_url(app_id: &str) -> String {
    format!("https://cdn.akamai.steamstatic.com/steam/apps/{}/header.jpg", app_id)
}

/// Get Steam poster URL (library portrait)
fn steam_poster_url(app_id: &str) -> String {
    format!("https://cdn.akamai.steamstatic.com/steam/apps/{}/library_600x900.jpg", app_id)
}

/// Get Steam hero/wide image URL
fn steam_hero_url(app_id: &str) -> String {
    format!("https://cdn.akamai.steamstatic.com/steam/apps/{}/page_bg_generated_v6b.jpg", app_id)
}

/// Extract icon from EXE file
fn extract_exe_icon(exe_path: &str) -> Option<String> {
    // Use the existing extract_exe_icon command logic
    // For now, return None - will be handled by the frontend
    let path = std::path::Path::new(exe_path);
    if !path.exists() {
        return None;
    }

    // Try to get icon via PowerShell
    let output = std::process::Command::new("powershell")
        .args([
            "-Command",
            &format!(
                "Add-Type -AssemblyName System.Drawing; $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('{}'); if ($icon) {{ $bmp = $icon.ToBitmap(); $ms = New-Object System.IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($ms.ToArray()) }}",
                exe_path.replace('\\', "\\\\")
            ),
        ])
        .creation_flags(0x08000000)
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let b64 = stdout.trim();
    if b64.is_empty() || b64.len() < 100 {
        return None;
    }

    Some(format!("data:image/png;base64,{}", b64))
}

/// Enrich a single game with metadata
fn enrich_game(game: &ScannedGame) -> EnrichedGame {
    let mut cover_local = game.cover_path.clone();
    let mut icon_local = None;

    // Steam games: download artwork
    if game.platform == "Steam" {
        if let Some(ref app_id) = game.app_id {
            let header_file = format!("steam_{}_header.jpg", app_id);
            if let Some(path) = download_to_cache_sync(&steam_header_url(app_id), &header_file) {
                cover_local = Some(path);
            }

            // Also try poster
            let poster_file = format!("steam_{}_poster.jpg", app_id);
            if let Some(_path) = download_to_cache_sync(&steam_poster_url(app_id), &poster_file) {
                // Poster is for future use
            }
        }
    }

    // Non-Steam games: extract EXE icon
    if game.platform != "Steam" {
        if let Some(ref exe_path) = game.exe_path {
            if let Some(icon) = extract_exe_icon(exe_path) {
                icon_local = Some(icon);
            }
        }
    }

    EnrichedGame {
        game: game.clone(),
        cover_local,
        icon_local,
    }
}

/// Enrich all games with metadata (parallel)
pub fn enrich_games_parallel(games: &[ScannedGame]) -> Vec<EnrichedGame> {
    let enriched = Arc::new(Mutex::new(Vec::new()));
    let mut handles = vec![];

    // Process in batches of 4 to avoid overwhelming connections
    for chunk in games.chunks(4) {
        let chunk = chunk.to_vec();
        let enriched = Arc::clone(&enriched);

        let handle = thread::spawn(move || {
            for game in &chunk {
                let result = enrich_game(game);
                enriched.lock().unwrap().push(result);
            }
        });

        handles.push(handle);
    }

    for handle in handles {
        let _ = handle.join();
    }

    let mut result = enriched.lock().unwrap().clone();
    result.sort_by(|a, b| a.game.name.to_lowercase().cmp(&b.game.name.to_lowercase()));
    result
}

/// Get local artwork path for a game (check cache)
pub fn get_cached_artwork(game_id: &str, art_type: &str) -> Option<String> {
    let cache_dir = artwork_cache_dir();
    let patterns = vec![
        format!("{}_{}.jpg", game_id, art_type),
        format!("{}_{}.png", game_id, art_type),
    ];

    for pattern in patterns {
        let path = cache_dir.join(&pattern);
        if path.exists() {
            return Some(path.to_string_lossy().to_string());
        }
    }

    None
}

/// Clear artwork cache
pub fn clear_artwork_cache() -> Result<(), String> {
    let cache_dir = artwork_cache_dir();
    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Get cache size in bytes
pub fn get_cache_size() -> u64 {
    let cache_dir = artwork_cache_dir();
    if !cache_dir.exists() {
        return 0;
    }
    calculate_folder_size(&cache_dir)
}
