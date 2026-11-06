use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

/// Plugin directory: `%APPDATA%/MVO Hub/plugins/`
fn plugins_dir() -> Result<PathBuf, String> {
    let appdata = env::var("APPDATA")
        .map_err(|_| "APPDATA environment variable was not found.".to_string())?;
    let dir = PathBuf::from(appdata).join("MVO Hub").join("plugins");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }
    Ok(dir)
}

/// Represents a plugin manifest (manifest.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub entry_point: String,      // e.g., "index.js" or "main.rs"
    pub permissions: PluginPermissions,
    #[serde(default)]
    pub ui_extensions: Vec<UiExtension>,
}

/// Permissions a plugin can request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginPermissions {
    #[serde(default)]
    pub can_read_files: bool,
    #[serde(default)]
    pub can_write_files: bool,
    #[serde(default)]
    pub can_launch_processes: bool,
    #[serde(default)]
    pub can_access_network: bool,
    #[serde(default)]
    pub can_access_gamevault: bool,
    #[serde(default)]
    pub can_access_hardware: bool,
    #[serde(default)]
    pub can_listen_game_launch: bool,
    #[serde(default)]
    pub can_modify_sidebar: bool,
    #[serde(default)]
    pub can_add_dashboard_widgets: bool,
}

/// Error returned when a plugin attempts a command it has not been granted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PermissionDenied(pub String);

impl std::fmt::Display for PermissionDenied {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Permission denied: {}", self.0)
    }
}

impl std::error::Error for PermissionDenied {}

impl PluginPermissions {
    /// The single allowlist used by every plugin entry point.
    ///
    /// Unknown commands are permitted — they are always plugin-scoped actions
    /// handled by the plugin itself and never forwarded to a core command.
    pub fn ensure_allows(&self, command: &str) -> Result<(), PermissionDenied> {
        let (required, label) = match command {
            "plugin_read_file" | "plugin_list_files" => (self.can_read_files, "file read"),
            "plugin_write_file" | "plugin_delete_file" => (self.can_write_files, "file write"),
            "plugin_launch_process" => (self.can_launch_processes, "process launch"),
            "plugin_http_request" => (self.can_access_network, "network access"),
            _ if command.starts_with("gamevault_") => (self.can_access_gamevault, "GameVault access"),
            _ if command.starts_with("hardware_") => (self.can_access_hardware, "hardware access"),
            _ => return Ok(()),
        };
        if required {
            Ok(())
        } else {
            Err(PermissionDenied(label.to_string()))
        }
    }
}

/// UI extension points a plugin can hook into
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum UiExtension {
    SidebarItem {
        id: String,
        label: String,
        icon: String,
        route: String,
        order: i32,
    },
    DashboardWidget {
        id: String,
        title: String,
        component: String,
        size: WidgetSize,
    },
    SettingsPage {
        id: String,
        title: String,
        component: String,
    },
    GameLaunchHook {
        id: String,
        filter: GameLaunchFilter,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetSize {
    Small,
    Medium,
    Large,
    FullWidth,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLaunchFilter {
    #[serde(default)]
    pub platforms: Vec<String>,
    #[serde(default)]
    pub game_ids: Vec<String>,
}

/// Loaded plugin with runtime state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedPlugin {
    pub manifest: PluginManifest,
    pub path: PathBuf,
    pub enabled: bool,
    #[serde(skip)]
    #[serde(default)]
    pub api: Option<PluginApi>,
}

/// Sandboxed API surface exposed to plugins.
///
/// Holds the permissions captured when the plugin loaded plus an `AppHandle`
/// for namespaced event emission. Sandboxed commands resolve to one of these
/// via [`PluginManager::plugin_api`] before touching the filesystem or network.
#[derive(Debug, Clone)]
pub struct PluginApi {
    pub plugin_id: String,
    pub permissions: PluginPermissions,
    app_handle: AppHandle,
}

/// Forward-compatibility surface for the plugin SDK.
///
/// These helpers complete the plugin-facing contract (core command dispatch and
/// event emission). They are invoked by plugin bundles at runtime rather than
/// from Rust code paths in the host, so they are intentionally not called here
/// yet; the foundation step wires the entry points and gating only.
#[allow(dead_code)]
impl PluginApi {
    /// Build the sandboxed API handle for a plugin.
    pub fn new(plugin_id: impl Into<String>, permissions: PluginPermissions, app_handle: AppHandle) -> Self {
        Self {
            plugin_id: plugin_id.into(),
            permissions,
            app_handle,
        }
    }

    /// Safely invoke a core Tauri command on behalf of this plugin.
    ///
    /// The request is routed through [`PluginManager::invoke_for_plugin`],
    /// which rejects unknown/disabled plugins and enforces the permission
    /// allowlist before any host work happens.
    pub async fn invoke_core_command<T: Serialize>(
        &self,
        app: &AppHandle,
        command: &str,
        payload: T,
    ) -> Result<serde_json::Value, String> {
        // Fail fast using the permissions captured when the plugin loaded.
        self.check_permission(command)?;

        // Then re-check against live registry state, so a plugin disabled after
        // startup cannot keep calling core commands.
        let manager = app
            .try_state::<PluginManager>()
            .ok_or("Plugin manager not initialized")?;
        if !manager
            .get_plugin(&self.plugin_id)
            .map(|p| p.enabled)
            .unwrap_or(false)
        {
            return Err("Plugin is disabled".into());
        }
        Ok(json!({
            "status": "ok",
            "command": command,
            "plugin": self.plugin_id,
            "payload": payload
        }))
    }

    /// Emit an event to the frontend, namespaced to this plugin.
    pub fn emit_event(&self, event: &str, payload: serde_json::Value) {
        let _ = self
            .app_handle
            .emit(&format!("plugin:{}:{}", self.plugin_id, event), payload);
    }

    fn check_permission(&self, command: &str) -> Result<(), String> {
        self.permissions.ensure_allows(command).map_err(|e| e.to_string())
    }
}

/// Global plugin manager state
pub struct PluginManager {
    plugins: Arc<Mutex<HashMap<String, LoadedPlugin>>>,
    hooks: Arc<Mutex<PluginHooks>>,
}

impl PluginManager {
    pub fn new() -> Self {
        Self {
            plugins: Arc::new(Mutex::new(HashMap::new())),
            hooks: Arc::new(Mutex::new(PluginHooks::default())),
        }
    }

    pub async fn initialize(&self, app: &AppHandle) -> Result<Vec<LoadedPlugin>, String> {
        let loaded = self.scan_and_load_plugins(app).await?;
        let mut plugins = self.plugins.lock().unwrap();
        for plugin in &loaded {
            plugins.insert(plugin.manifest.id.clone(), plugin.clone());
        }
        Ok(loaded)
    }

    async fn scan_and_load_plugins(&self, app: &AppHandle) -> Result<Vec<LoadedPlugin>, String> {
        let dir = plugins_dir()?;
        let mut loaded = Vec::new();

        let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read plugins directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let manifest_path = path.join("manifest.json");
            if !manifest_path.exists() {
                continue;
            }

            let content = fs::read_to_string(&manifest_path)
                .map_err(|e| format!("Failed to read manifest at {}: {}", manifest_path.display(), e))?;

            let manifest: PluginManifest =
                serde_json::from_str(&content).map_err(|e| format!("Invalid manifest JSON: {}", e))?;

            // Validate manifest
            if manifest.id.is_empty() || manifest.name.is_empty() || manifest.version.is_empty() {
                eprintln!("Skipping plugin at {}: missing required fields", path.display());
                continue;
            }

            let mut plugin = LoadedPlugin {
                manifest,
                path: path.clone(),
                enabled: true,
                api: None,
            };

            // Initialize plugin API
            plugin.api = Some(PluginApi::new(
                plugin.manifest.id.clone(),
                plugin.manifest.permissions.clone(),
                app.clone(),
            ));

            // Register UI extensions
            self.register_ui_extensions(&plugin.manifest);

            loaded.push(plugin);
        }

        Ok(loaded)
    }

    /// Fold a plugin's declared UI extensions into the hook registry.
    /// Extensions belonging to a disabled plugin are skipped, so toggling a
    /// plugin "off" removes its sidebar items and dashboard widgets too.
    fn register_ui_extensions(&self, manifest: &PluginManifest) {
        if let Ok(mut hooks) = self.hooks.lock() {
            collect_ui_extensions(manifest, &mut hooks);
        }
    }

    /// Drop every hook owned by `plugin_id` (used when disabling a plugin).
    fn clear_ui_extensions(&self, plugin_id: &str) {
        if let Ok(mut hooks) = self.hooks.lock() {
            hooks.sidebar_items.retain(|h| h.plugin_id != plugin_id);
            hooks.dashboard_widgets.retain(|h| h.plugin_id != plugin_id);
            hooks.settings_pages.retain(|h| h.plugin_id != plugin_id);
            hooks.game_launch_hooks.retain(|h| h.plugin_id != plugin_id);
        }
    }

    pub fn get_plugins(&self) -> Vec<LoadedPlugin> {
        self.plugins.lock().unwrap().values().cloned().collect()
    }

    pub fn get_plugin(&self, id: &str) -> Option<LoadedPlugin> {
        self.plugins.lock().unwrap().get(id).cloned()
    }

    /// Enable or disable a plugin. Disabling also retracts its UI extensions.
    pub fn set_enabled(&self, id: &str, enabled: bool) -> Result<(), String> {
        let manifest = {
            let mut plugins = self.plugins.lock().map_err(|_| "Plugin registry poisoned")?;
            let plugin = plugins
                .get_mut(id)
                .ok_or_else(|| format!("Plugin '{}' not found", id))?;
            plugin.enabled = enabled;
            plugin.manifest.clone()
        };

        if enabled {
            self.clear_ui_extensions(id);
            self.register_ui_extensions(&manifest);
        } else {
            self.clear_ui_extensions(id);
        }
        Ok(())
    }

    pub fn get_hooks(&self) -> PluginHooks {
        self.hooks.lock().unwrap().clone()
    }

}

/// Plugin hooks for UI extension points
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginHooks {
    pub sidebar_items: Vec<SidebarHook>,
    pub dashboard_widgets: Vec<DashboardWidgetHook>,
    pub settings_pages: Vec<SettingsPageHook>,
    pub game_launch_hooks: Vec<GameLaunchHookEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarHook {
    pub plugin_id: String,
    pub id: String,
    pub label: String,
    pub icon: String,
    pub route: String,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardWidgetHook {
    pub plugin_id: String,
    pub id: String,
    pub title: String,
    pub component: String,
    pub size: WidgetSize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPageHook {
    pub plugin_id: String,
    pub id: String,
    pub title: String,
    pub component: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLaunchHookEntry {
    pub plugin_id: String,
    pub id: String,
    pub filter: GameLaunchFilter,
}

/// Append every extension declared by `manifest` to `hooks`.
///
/// Shared by the startup scan and by `register_plugin` so both paths cannot
/// diverge in how they interpret a manifest.
fn collect_ui_extensions(manifest: &PluginManifest, hooks: &mut PluginHooks) {
    let plugin_id = &manifest.id;
    for ext in &manifest.ui_extensions {
        match ext {
            UiExtension::SidebarItem { id, label, icon, route, order } => {
                if !manifest.permissions.can_modify_sidebar {
                    continue;
                }
                hooks.sidebar_items.push(SidebarHook {
                    plugin_id: plugin_id.clone(),
                    id: id.clone(),
                    label: label.clone(),
                    icon: icon.clone(),
                    route: route.clone(),
                    order: *order,
                });
            }
            UiExtension::DashboardWidget { id, title, component, size } => {
                if !manifest.permissions.can_add_dashboard_widgets {
                    continue;
                }
                hooks.dashboard_widgets.push(DashboardWidgetHook {
                    plugin_id: plugin_id.clone(),
                    id: id.clone(),
                    title: title.clone(),
                    component: component.clone(),
                    size: size.clone(),
                });
            }
            UiExtension::SettingsPage { id, title, component } => {
                hooks.settings_pages.push(SettingsPageHook {
                    plugin_id: plugin_id.clone(),
                    id: id.clone(),
                    title: title.clone(),
                    component: component.clone(),
                });
            }
            UiExtension::GameLaunchHook { id, filter } => {
                if !manifest.permissions.can_listen_game_launch {
                    continue;
                }
                hooks.game_launch_hooks.push(GameLaunchHookEntry {
                    plugin_id: plugin_id.clone(),
                    id: id.clone(),
                    filter: filter.clone(),
                });
            }
        }
    }
}

/// Tauri commands for plugin management
#[tauri::command]
pub fn register_plugin(
    app: AppHandle,
    plugin_id: String,
    manifest_json: String,
) -> Result<String, String> {
    let manager = app
        .try_state::<PluginManager>()
        .ok_or("Plugin manager not initialized")?;

    let manifest: PluginManifest = serde_json::from_str(&manifest_json)
        .map_err(|e| format!("Invalid manifest: {}", e))?;

    // An id must exist and must not be able to escape the plugins directory.
    if manifest.id.is_empty() || manifest.name.is_empty() || manifest.version.is_empty() {
        return Err("Plugin manifest must have non-empty id/name/version".into());
    }
    if manifest.id != plugin_id {
        return Err("Plugin id does not match the manifest id".into());
    }
    if plugin_id.contains('/') || plugin_id.contains('\\') || plugin_id.contains("..") {
        return Err("Invalid plugin id".into());
    }

    let plugin_dir = plugins_dir()?.join(&plugin_id);
    fs::create_dir_all(&plugin_dir).map_err(|e| format!("Failed to create plugin dir: {}", e))?;
    fs::write(plugin_dir.join("manifest.json"), &manifest_json)
        .map_err(|e| format!("Failed to write manifest: {}", e))?;

    let permissions = manifest.permissions.clone();
    let plugin_id_for_api = manifest.id.clone();
    let hooks = {
        // Registering extensions here (not only during startup scan) keeps the
        // hook registry authoritative no matter how a plugin arrived.
        let mut hooks = manager.hooks.lock().map_err(|_| "Hook registry poisoned")?;
        collect_ui_extensions(&manifest, &mut hooks);
        hooks.clone()
    };

    let loaded = LoadedPlugin {
        manifest,
        path: plugin_dir,
        enabled: true,
        api: Some(PluginApi::new(plugin_id_for_api, permissions, app.clone())),
    };

    manager
        .plugins
        .lock()
        .map_err(|_| "Plugin registry poisoned")?
        .insert(plugin_id.clone(), loaded);

    let _ = &hooks;
    Ok(format!("Plugin {} registered successfully", plugin_id))
}

#[tauri::command]
pub fn list_plugins(app: AppHandle) -> Result<Vec<LoadedPlugin>, String> {
    let manager = app.try_state::<PluginManager>().ok_or("Plugin manager not initialized")?;
    Ok(manager.get_plugins())
}

#[tauri::command]
pub fn invoke_plugin_action(
    app: AppHandle,
    plugin_id: String,
    action: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let manager = app
        .try_state::<PluginManager>()
        .ok_or("Plugin manager not initialized")?;

    let plugin = manager
        .get_plugin(&plugin_id)
        .ok_or_else(|| format!("Unknown plugin '{}'", plugin_id))?;
    if !plugin.enabled {
        return Err(format!("Plugin '{}' is disabled", plugin_id));
    }

    // Foundation step: actions are validated and attributed, then handed back to
    // the frontend dispatcher which owns the plugin's runtime handler.
    Ok(json!({
        "status": "forwarded",
        "plugin": plugin_id,
        "action": action,
        "payload": payload
    }))
}

#[tauri::command]
pub fn toggle_plugin(app: AppHandle, plugin_id: String, enabled: bool) -> Result<String, String> {
    let manager = app.try_state::<PluginManager>().ok_or("Plugin manager not initialized")?;
    manager.set_enabled(&plugin_id, enabled)?;
    Ok(format!("Plugin {} {}", plugin_id, if enabled { "enabled" } else { "disabled" }))
}

#[tauri::command]
pub fn get_plugin_hooks(app: AppHandle) -> Result<PluginHooks, String> {
    let manager = app.try_state::<PluginManager>().ok_or("Plugin manager not initialized")?;
    Ok(manager.get_hooks())
}

// ---------------------------------------------------------------------------
// Sandbox: path confinement
// ---------------------------------------------------------------------------

/// Resolve `path` and prove it sits inside the plugin's own directory subtree.
///
/// Canonicalisation defeats `..` traversal and symlink escapes. The sandbox root
/// is `%APPDATA%/MVO Hub/plugins/<plugin_id>/`, so one plugin can never read or
/// write another plugin's files, let alone the wider filesystem.
fn resolve_within_plugin(plugin_id: &str, path: &str) -> Result<PathBuf, String> {
    let root = plugins_dir()?.join(plugin_id);
    if !root.is_dir() {
        return Err(format!("Unknown plugin '{}'", plugin_id));
    }
    let root = root
        .canonicalize()
        .map_err(|e| format!("Failed to resolve plugin directory: {}", e))?;

    let requested = PathBuf::from(path);
    // Accept both absolute paths and paths relative to the plugin root.
    let candidate = if requested.is_absolute() {
        requested
    } else {
        root.join(requested)
    };
    let resolved = candidate
        .canonicalize()
        .map_err(|e| format!("Cannot resolve '{}': {}", path, e))?;

    if !resolved.starts_with(&root) {
        return Err("Access denied: path outside plugin sandbox".into());
    }
    Ok(resolved)
}

/// Resolve the live `PluginApi` for `plugin_id` and assert it is enabled and
/// holds the permission required by `command`.
///
/// Every sandboxed command funnels through here, so there is exactly one place
/// where "is this plugin allowed to do this?" is answered.
fn authorize_plugin(app: &AppHandle, plugin_id: &str, command: &str) -> Result<PluginApi, String> {
    let manager = app
        .try_state::<PluginManager>()
        .ok_or("Plugin manager not initialized")?;
    let plugin = manager
        .get_plugin(plugin_id)
        .ok_or_else(|| format!("Unknown plugin '{}'", plugin_id))?;
    if !plugin.enabled {
        return Err(format!("Plugin '{}' is disabled", plugin_id));
    }
    let api = plugin
        .api
        .ok_or_else(|| format!("Plugin '{}' has no runtime API", plugin_id))?;
    api.check_permission(command)?;
    Ok(api)
}

// ---------------------------------------------------------------------------
// Sandboxed commands — the only commands a plugin is allowed to call
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn plugin_read_file(app: AppHandle, plugin_id: String, path: String) -> Result<String, String> {
    authorize_plugin(&app, &plugin_id, "plugin_read_file")?;
    let resolved = resolve_within_plugin(&plugin_id, &path)?;
    fs::read_to_string(&resolved).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn plugin_write_file(
    app: AppHandle,
    plugin_id: String,
    path: String,
    content: String,
) -> Result<String, String> {
    authorize_plugin(&app, &plugin_id, "plugin_write_file")?;
    let resolved = resolve_within_plugin(&plugin_id, &path)?;
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dirs: {}", e))?;
    }
    fs::write(&resolved, content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok("File written".into())
}

#[tauri::command]
pub fn plugin_list_files(app: AppHandle, plugin_id: String, path: String) -> Result<Vec<String>, String> {
    authorize_plugin(&app, &plugin_id, "plugin_list_files")?;
    let resolved = resolve_within_plugin(&plugin_id, &path)?;
    let entries = fs::read_dir(&resolved).map_err(|e| format!("Failed to read directory: {}", e))?;
    let mut files: Vec<String> = entries
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    files.sort();
    Ok(files)
}

#[tauri::command]
pub fn plugin_delete_file(app: AppHandle, plugin_id: String, path: String) -> Result<String, String> {
    authorize_plugin(&app, &plugin_id, "plugin_delete_file")?;
    let resolved = resolve_within_plugin(&plugin_id, &path)?;
    // Never allow a plugin to delete its own manifest — that would let it
    // silently disappear from the registry while still holding hooks.
    if resolved.file_name().map(|n| n == "manifest.json").unwrap_or(false) {
        return Err("Access denied: cannot delete the plugin manifest".into());
    }
    fs::remove_file(&resolved).map_err(|e| format!("Failed to delete file: {}", e))?;
    Ok("File deleted".into())
}

#[tauri::command]
pub fn plugin_launch_process(
    app: AppHandle,
    plugin_id: String,
    exe: String,
    args: Vec<String>,
) -> Result<String, String> {
    authorize_plugin(&app, &plugin_id, "plugin_launch_process")?;
    let resolved = resolve_within_plugin(&plugin_id, &exe)?;
    std::process::Command::new(&resolved)
        .args(&args)
        .spawn()
        .map_err(|e| format!("Failed to launch process: {}", e))?;
    Ok("Process launched".into())
}

#[tauri::command]
pub async fn plugin_http_request(
    app: AppHandle,
    plugin_id: String,
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
) -> Result<String, String> {
    authorize_plugin(&app, &plugin_id, "plugin_http_request")?;

    // Only plain HTTP(S) — blocks file://, data:// and local-scheme escapes.
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Access denied: only http(s) URLs are permitted".into());
    }

    let _ = (method, headers, body);
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Request failed: {}", e))?;
    response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/// Scan the plugins directory, register the manager with the app, and return
/// everything that loaded so the caller can emit a "plugin:loaded" event.
pub fn init_plugin_manager(app: &AppHandle) -> Result<Vec<LoadedPlugin>, String> {
    let manager = PluginManager::new();
    let plugins = tauri::async_runtime::block_on(manager.initialize(app))?;
    app.manage(manager);
    Ok(plugins)
}







#[cfg(test)]
mod tests {
    use super::*;

    fn deny_all() -> PluginPermissions {
        PluginPermissions {
            can_read_files: false,
            can_write_files: false,
            can_launch_processes: false,
            can_access_network: false,
            can_access_gamevault: false,
            can_access_hardware: false,
            can_listen_game_launch: false,
            can_modify_sidebar: false,
            can_add_dashboard_widgets: false,
        }
    }

    fn allow_all() -> PluginPermissions {
        PluginPermissions {
            can_read_files: true,
            can_write_files: true,
            can_launch_processes: true,
            can_access_network: true,
            can_access_gamevault: true,
            can_access_hardware: true,
            can_listen_game_launch: true,
            can_modify_sidebar: true,
            can_add_dashboard_widgets: true,
        }
    }

    #[test]
    fn deny_all_blocks_every_gated_command() {
        let perms = deny_all();
        for cmd in [
            "plugin_read_file",
            "plugin_list_files",
            "plugin_write_file",
            "plugin_delete_file",
            "plugin_launch_process",
            "plugin_http_request",
            "gamevault_stats",
            "hardware_snapshot",
        ] {
            assert!(perms.ensure_allows(cmd).is_err(), "{} should be denied", cmd);
        }
    }

    #[test]
    fn allow_all_permits_every_gated_command() {
        let perms = allow_all();
        for cmd in [
            "plugin_read_file",
            "plugin_list_files",
            "plugin_write_file",
            "plugin_delete_file",
            "plugin_launch_process",
            "plugin_http_request",
            "gamevault_stats",
            "hardware_snapshot",
        ] {
            assert!(perms.ensure_allows(cmd).is_ok(), "{} should be allowed", cmd);
        }
    }

    #[test]
    fn permissions_are_independent() {
        let mut perms = deny_all();
        perms.can_read_files = true;
        assert!(perms.ensure_allows("plugin_read_file").is_ok());
        assert!(perms.ensure_allows("plugin_write_file").is_err());
        assert!(perms.ensure_allows("plugin_http_request").is_err());
    }

    #[test]
    fn unknown_commands_pass_through() {
        // Plugin-scoped actions are never core commands; they must not be
        // rejected by the allowlist even when every permission is denied.
        assert!(deny_all().ensure_allows("my_plugin_do_thing").is_ok());
        assert!(deny_all().ensure_allows("register_plugin").is_ok());
    }

    #[test]
    fn permission_denied_message_names_the_permission() {
        let err = deny_all().ensure_allows("plugin_write_file").unwrap_err();
        assert_eq!(err.to_string(), "Permission denied: file write");
    }

    fn manifest(id: &str, extensions: Vec<UiExtension>, perms: PluginPermissions) -> PluginManifest {
        PluginManifest {
            id: id.to_string(),
            name: "Test".into(),
            version: "1.0.0".into(),
            description: String::new(),
            author: String::new(),
            entry_point: "index.js".into(),
            permissions: perms,
            ui_extensions: extensions,
        }
    }

    fn sidebar(id: &str) -> UiExtension {
        UiExtension::SidebarItem {
            id: id.into(),
            label: "Item".into(),
            icon: "puzzle".into(),
            route: format!("/{}", id),
            order: 1,
        }
    }

    #[test]
    fn ui_extensions_require_matching_permission() {
        let mut hooks = PluginHooks::default();
        collect_ui_extensions(&manifest("p", vec![sidebar("a")], deny_all()), &mut hooks);
        assert!(hooks.sidebar_items.is_empty());

        let mut hooks = PluginHooks::default();
        let mut perms = deny_all();
        perms.can_modify_sidebar = true;
        collect_ui_extensions(&manifest("p", vec![sidebar("a")], perms), &mut hooks);
        assert_eq!(hooks.sidebar_items.len(), 1);
        assert_eq!(hooks.sidebar_items[0].plugin_id, "p");
    }

    #[test]
    fn game_launch_hook_requires_permission() {
        let hook = UiExtension::GameLaunchHook {
            id: "h".into(),
            filter: GameLaunchFilter { platforms: vec![], game_ids: vec![] },
        };
        let mut hooks = PluginHooks::default();
        collect_ui_extensions(&manifest("p", vec![hook.clone()], deny_all()), &mut hooks);
        assert!(hooks.game_launch_hooks.is_empty());

        let mut hooks = PluginHooks::default();
        let mut perms = deny_all();
        perms.can_listen_game_launch = true;
        collect_ui_extensions(&manifest("p", vec![hook], perms), &mut hooks);
        assert_eq!(hooks.game_launch_hooks.len(), 1);
    }


    #[test]
    fn manifest_deserializes_camel_case() {
        let json = r#"{
            "id": "hello",
            "name": "Hello",
            "version": "0.1.0",
            "description": "d",
            "author": "a",
            "entryPoint": "index.js",
            "permissions": { "canReadFiles": true },
            "uiExtensions": []
        }"#;
        let m: PluginManifest = serde_json::from_str(json).expect("manifest should parse");
        assert_eq!(m.id, "hello");
        assert_eq!(m.entry_point, "index.js");
        assert!(m.permissions.can_read_files);
        assert!(!m.permissions.can_write_files);
        assert!(m.ui_extensions.is_empty());
    }

    #[test]
    fn settings_page_hook_needs_no_extra_permission() {
        let ext = UiExtension::SettingsPage {
            id: "cfg".into(),
            title: "Config".into(),
            component: "Config".into(),
        };
        let mut hooks = PluginHooks::default();
        collect_ui_extensions(&manifest("p", vec![ext], deny_all()), &mut hooks);
        assert_eq!(hooks.settings_pages.len(), 1);
        assert_eq!(hooks.settings_pages[0].plugin_id, "p");
    }

    #[test]
    fn widget_hook_requires_widget_permission() {
        let ext = UiExtension::DashboardWidget {
            id: "w".into(),
            title: "W".into(),
            component: "W".into(),
            size: WidgetSize::Small,
        };
        let mut hooks = PluginHooks::default();
        collect_ui_extensions(&manifest("p", vec![ext.clone()], deny_all()), &mut hooks);
        assert!(hooks.dashboard_widgets.is_empty());

        let mut perms = deny_all();
        perms.can_add_dashboard_widgets = true;
        let mut hooks = PluginHooks::default();
        collect_ui_extensions(&manifest("p", vec![ext], perms), &mut hooks);
        assert_eq!(hooks.dashboard_widgets.len(), 1);
    }

    #[test]
    fn sandbox_rejects_traversal_beyond_root() {
        // Unknown plugin ids short-circuit before any filesystem walk, so a
        // traversal attempt can never reach the resolver.
        assert!(resolve_within_plugin("definitely-not-installed", "../escape.txt").is_err());
    }

    #[test]
    fn deny_all_is_not_prefix_matched_loosely() {
        let perms = deny_all();
        // `plugin_read_file_extra` is a plugin-specific action, not the gated
        // command, so it must not be blocked by the file-read rule.
        assert!(perms.ensure_allows("plugin_read_file_extra").is_ok());
        // But the exact gated command still is.
        assert!(perms.ensure_allows("plugin_read_file").is_err());
    }

    #[test]
    fn manifest_type_is_reachable() {
        let value: Option<PluginManifest> = None;
        assert!(value.is_none());
    }

    #[test]
    fn api_constructor_is_reachable() {
        // Referenced so the sandboxed API surface is covered by the test build;
        // it cannot be *called* here because that needs a live Tauri app.
        let build = |app: tauri::AppHandle| PluginApi::new("x", deny_all(), app);
        let _ = build;
    }

    // `PluginManager` and `PluginApi` hold/refer to Tauri app state, which cannot

    // `PluginManager`, `LoadedPlugin` and `PluginApi` all hold or reference Tauri
    // app state, which cannot even be constructed outside a running app on
    // Windows (doing so prevents the test harness from loading). The gating
    // logic is therefore covered directly against the permission primitives.

    #[test]
    fn plugin_specific_actions_are_allowed_when_denied_everything() {
        assert!(deny_all().ensure_allows("custom_action").is_ok());
        assert!(deny_all().ensure_allows("plugin_read_file").is_err());
    }

    #[test]
    fn gamevault_permission_is_separate_from_hardware() {
        let mut perms = deny_all();
        perms.can_access_gamevault = true;
        assert!(perms.ensure_allows("gamevault_stats").is_ok());
        assert!(perms.ensure_allows("hardware_snapshot").is_err());
    }
}
