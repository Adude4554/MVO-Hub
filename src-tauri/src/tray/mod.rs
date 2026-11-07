///! System Tray, Global Shortcuts & Window Persistence
//! 
//! - Native system tray menu with minimize-to-tray on close
//! - Global keyboard shortcuts for quick overlays/actions
//! - Window position, size, and maximized-state persistence across restarts

use tauri_plugin_menu::Menu;
use tauri_plugin_menu::MenuItem;
use tauri_plugin_windowstate::WindowStateManager;
use tauri_plugin_global_shortcut::GlobalShortcut;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::sync::Mutex;

/// Tray menu item identifiers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TrayMenuItem {
    Show,
    Hide,
    Status,
    Quit,
}

/// State for tray persistence (window geometry)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPersistence {
    /// Window position (x, y)
    pub position: (i32, i32),
    /// Window size (width, height)
    pub size: (u32, u32),
    /// Whether the window was maximized
    pub maximized: bool,
}

impl Default for WindowPersistence {
    fn default() -> Self {
        WindowPersistence {
            position: (0, 0),
            size: (1500, 900),
            maximized: false,
        }
    }
}

/// Tray menu builder creates the default tray menu
pub fn build_tray_menu<B: tauri::BaseWebEventHandler + 'static>(
    app_handle: tauri::AppHandle,
) -> Menu {
    let show_item = MenuItem::new("Show", tauri_plugin_menu::MenuItemKind::Normal);
    let hide_item = MenuItem::new("Hide", tauri_plugin_menu::MenuItemKind::Normal);
    let status_item = MenuItem::new("Status", tauri_plugin_menu::MenuItemKind::Normal);
    // We'll disable the status item for now or make it toggle
    let _status_disabled = MenuItem::new("Online", tauri_plugin_menu::MenuItemKind::Normal);
    let quit_item = MenuItem::new("Quit", tauri_plugin_menu::MenuItemKind::Normal);

    // Build the menu: clicking Show/Hide toggles visibility
    let menu = Menu::new()
        .add_item(&show_item)
        .add_item(&hide_item)
        .add_item(&status_item)
        .add_native_separator()
        .add_item(&quit_item);

    // Attach click handlers
    // Show: bring window to front
    // Hide: minimize to tray
    // Quit: exit the application
    
    // Note: The actual event handling is done in the Tauri command layer
    // This menu just provides the structure
    
    menu
}

/// Persist window geometry to a JSON file in the app data directory
pub fn persist_window_geometry(
    state: &WindowPersistence,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let data_dir = dirs::cache_dir()
        .ok_or_else(|| "Cannot determine cache directory".to_string())?
        .join("mvo_hub");
    
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create persist dir: {}", e))?;
    
    let path = data_dir.join("window_persistence.json");
    let json = serde_json::to_string(state).map_err(|e| format!("Failed to serialize: {}", e))?;
    
    std::fs::write(&path, json).map_err(|e| format!("Failed to write persist file: {}", e))?;
    
    Ok(())
}

/// Load persisted window geometry from the app data directory
pub fn load_window_geometry(app_handle: &tauri::AppHandle) -> WindowPersistence {
    let data_dir = dirs::cache_dir()
        .ok()
        .map(|p| p.join("mvo_hub"));
    
    let path = data_dir.map(|p| p.join("window_persistence.json"));
    
    match path.as_ref().and_then(|p| std::fs::read_to_string(p).ok()) {
        Some(content) => {
            match serde_json::from_str::<WindowPersistence>(&content) {
                Ok(geom) => geom,
                Err(_) => WindowPersistence::default(),
            }
        }
        None => WindowPersistence::default(),
    }
}

/// Register global keyboard shortcuts
/// 
/// Supported formats: "CmdOrCtrl+Shift+P", "Alt+F4", "Ctrl+Shift+L", etc.
/// The tauri-plugin-global-shortcut handles the platform-specific mapping.
pub fn register_global_shortcuts(
    shortcuts: &[&str],
    app_handle: &tauri::AppHandle,
) -> Result<GlobalShortcut, String> {
    let mut handles = Vec::new();
    
    for shortcut_desc in shortcuts {
        let handle = GlobalShortcut::new(shortcut_desc, move || {
            // Trigger the action when shortcut is pressed
            // This will be handled by the frontend invoke
            let _ = app_handle.emit("global-shortcut-pressed", shortcut_desc);
        })
        .map_err(|e| format!("Failed to register shortcut '{}': {}", shortcut_desc, e))?;
        handles.push(handle);
    }
    
    // Return the first handle (or we could return all of them)
    handles.into_iter().next.ok_or_else(|| "No global shortcuts registered".to_string())
}

/// Toggle window visibility between show and hide
pub async fn toggle_window_visibility(
    app_handle: &tauri::AppHandle,
    window: &tauri::Window,
) -> Result<(), String> {
    if window.is_visible().await.unwrap_or(false) {
        window.hide().await.map_err(|e| format!("Failed to hide window: {}", e))?;
        Ok(())
    } else {
        window.show().await.map_err(|e| format!("Failed to show window: {}", e))?;
        window.emit("window-state-changed", "visible").ok();
        Ok(())
    }
}

/// Minimize window to tray (hide but keep running)
pub async fn minimize_to_tray(
    window: &tauri::Window,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    // Hide the window instead of closing it
    window.hide().await.map_err(|e| format!("Failed to hide window: {}", e))?;
    
    // Emit event that window was minimized
    window.emit("minimized-to-tray", ()).ok();
    
    Ok(())
}

/// Quit the application completely
pub async fn quit_application(app_handle: &tauri::AppHandle) -> Result<(), String> {
    // Clean up any persisted state
    let _ = persist_window_geometry(
        &load_window_geometry(app_handle),
        app_handle,
    );
    
    // Exit the application
    std::process::exit(0);
    // Note: We won't actually reach here, but the compiler needs it
    Ok(())
}

/// Load window persistence state and apply it to a window
pub async fn apply_window_persistence(
    window: &tauri::Window,
    persistence: &WindowPersistence,
) -> Result<(), String> {
    // Apply position and size
    window.set_position(
        tauri::PhysicalPosition::new(persistence.0 as f64, persistence.1 as f64),
    ).ok();
    
    window.set_size(tauri::PhysicalSize::new(
        persistence.1 as f64,
        persistence.2 as f64,
    )).ok();
    
    // Maximize if previously maximized
    if persistence.3 {
        window.maximize().ok();
    }
    
    Ok(())
}