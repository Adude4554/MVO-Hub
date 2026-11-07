//! Custom Theme Engine & Marketplace
//!
//! Dynamic CSS token injection engine that supports custom theme manifests
//! (theme.json), overriding --mvo-crimson variables on the fly.
//! Includes a "Theme Marketplace & Studio" settings panel for previewing,
//! installing, and sharing custom community themes.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::collections::HashMap;

/// A theme manifest that defines CSS variable overrides.
/// This is the schema for theme.json files hosted on the Marketplace or
//! loaded from the local theme directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeManifest {
    /// Unique identifier for the theme (usually a reversed domain name or UUID).
    pub id: String,
    /// Human-readable name of the theme.
    pub name: String,
    /// Description of the theme, visible in the Marketplace.
    pub description: String,
    /// Author or handle of the theme creator.
    pub author: String,
    /// Version of the theme manifest format (for forward compatibility).
    pub version: String,
    /// CSS variable overrides. Keys are CSS custom property names
    /// (e.g., "--mvo-crimson", "--mvo-bg-primary") and values are
    /// the override values (hex colors, lengths, etc.).
    pub variables: HashMap<String, String>,
    /// Optional preview image URL (base64 data URI or HTTPS URL).
    pub preview_image: Option<String>,
    /// Optional category for marketplace sorting/filtering.
    pub category: Option<String>,
    /// Optional tags for marketplace search.
    pub tags: Vec<String>,
    /// Minimum supported app version.
    pub min_app_version: String,
    /// Whether the theme requires an Enterprise tier to use.
    pub requires_enterprise: bool,
}

/// The current active theme applied to the UI.
/// Holds the manifest of the active theme and the timestamp it was loaded.
#[derive(Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTheme {
    /// The manifest of the currently active theme.
    pub manifest: Option<ThemeManifest>,
    /// When the theme was loaded (UTC ISO-8601).
    pub loaded_at: Option<String>,
    /// Whether the theme was loaded from the Marketplace (true) or local files (false).
    pub from_marketplace: bool,
}

/// Rust-side token injection that the frontend can call via Tauri IPC.
/// These correspond to CSS custom properties used in the UI.
#[tauri::command]
pub fn get_theme_tokens() -> HashMap<String, String> {
    let mut tokens = HashMap::new();
    tokens.insert("crimson".to_string(), "#c53030".to_string());
    tokens.insert("background".to_string(), "#0d050a".to_string());
    tokens.insert("surface".to_string(), "#1a0a0f".to_string());
    tokens.insert("on-surface".to_string(), "#f0e6e2".to_string());
    tokens.insert("accent".to_string(), "#d4a843".to_string());
    tokens.insert("border".to_string(), "#4a3d39".to_string());
    tokens.insert("link".to_string(), "#9b59b6".to_string());
    tokens.insert("error".to_string(), "#e74c3c".to_string());
    tokens.insert("success".to_string(), "#27ae60".to_string());
    tokens
}

/// Tauri command to apply a theme from a manifest file path.
/// Reads the theme.json file and returns the variable overrides.
#[tauri::command]
pub fn apply_theme(manifest_path: String) -> Result<HashMap<String, String>, String> {
    let path = std::path::Path::new(&manifest_path);
    let content = std::fs::read_to_string(path).map_err(|e| format!("Cannot read theme file: {}", e))?;
    let manifest: ThemeManifest = serde_json::from_str(&content).map_err(|e| format!("Invalid theme manifest JSON: {}", e))?;
    Ok(manifest.variables)
}

/// Tauri command to load themes from a directory.
#[tauri::command]
pub fn load_themes_from_dir(dir: String) -> Result<Vec<ThemeManifest>, String> {
    let path = std::path::Path::new(&dir);
    let mut themes = Vec::new();

    if !path.exists() {
        return Err("Theme directory does not exist".to_string());
    }

    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let file_path = entry.path();
            if file_path.file_name().and_then(|n| n.to_str()) == Some("theme.json") {
                let content = std::fs::read_to_string(&file_path).map_err(|e| format!("Cannot read {}", file_path.display()))?;
                let manifest: ThemeManifest = serde_json::from_str(&content).map_err(|e| format!("Invalid theme JSON: {}", e))?;
                themes.push(manifest);
            }
        }
    }

    Ok(themes)
}

/// Tauri command to set the active theme.
#[tauri::command]
pub fn set_active_theme(theme_id: String, themes: Vec<ThemeManifest>) -> Result<ActiveTheme, String> {
    for theme in &themes {
        if theme.id == theme_id {
            return Ok(ActiveTheme {
                manifest: Some(theme.clone()),
                loaded_at: Some(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)),
                from_marketplace: false,
            });
        }
    }
    Err(format!("Theme '{}' not found", theme_id))
}

/// Default theme token values corresponding to --mvo-crimson CSS variables.
pub const DEFAULT_THEME_TOKENS: HashMap<&str, &str> = HashMap::from([
    ("crimson", "#c53030"),
    ("background", "#0d050a"),
    ("surface", "#1a0a0f"),
    ("on-surface", "#f0e6e2"),
    ("accent", "#d4a843"),
    ("border", "#4a3d39"),
    ("link", "#9b59b6"),
    ("error", "#e74c3c"),
    ("success", "#27ae60"),
]);