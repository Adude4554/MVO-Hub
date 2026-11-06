/**
 * Project MVO — Plugin SDK (v0.3.0 foundation)
 *
 * Lightweight, framework-agnostic type definitions for third-party UI
 * extensions. These types mirror the Rust plugin host in
 * `src-tauri/src/plugins/mod.rs` (serde `camelCase`), so a manifest authored
 * against them can be dropped into
 * `%APPDATA%/MVO Hub/plugins/<id>/manifest.json` and be loaded verbatim.
 *
 * Nothing here touches the DOM or the Tauri runtime directly: plugins receive
 * a `PluginApi` object from the host, which is already permission-gated on the
 * Rust side. UI code only ever *reads* the declarations below.
 */

/** Permissions a plugin may request. Every flag defaults to `false` (deny). */
export interface PluginPermissions {
  /** Read files inside the plugin's own sandbox directory. */
  canReadFiles: boolean;
  /** Write/delete files inside the plugin's own sandbox directory. */
  canWriteFiles: boolean;
  /** Spawn executables located inside the plugin's own sandbox directory. */
  canLaunchProcesses: boolean;
  /** Perform outbound HTTP requests. */
  canAccessNetwork: boolean;
  /** Call GameVault commands. */
  canAccessGameVault: boolean;
  /** Call hardware sensor commands. */
  canAccessHardware: boolean;
  /** Subscribe to game-launch events. */
  canListenGameLaunch: boolean;
  /** Inject items into the sidebar. */
  canModifySidebar: boolean;
  /** Inject widgets into the Home dashboard. */
  canAddDashboardWidgets: boolean;
}

/** Filter used by `game-launch-hook` extensions to target which launches fire. */
export interface GameLaunchFilter {
  /** Platform identifiers, e.g. `["steam", "epic"]`. Empty = all platforms. */
  platforms: string[];
  /** Specific game ids. Empty = all games. */
  gameIds: string[];
}

export type WidgetSize = 'small' | 'medium' | 'large' | 'fullWidth';

export type UiExtension =
  | SidebarItemExtension
  | DashboardWidgetExtension
  | SettingsPageExtension
  | GameLaunchHookExtension;

/** Adds a navigation entry to the app sidebar. */
export interface SidebarItemExtension {
  type: 'sidebarItem';
  id: string;
  label: string;
  /** Lucide icon name the host resolves. */
  icon: string;
  /** In-app route the sidebar item navigates to. */
  route: string;
  /** Sort order relative to other plugin items (lower = higher up). */
  order: number;
}

/** Adds a card to the Home dashboard grid. */
export interface DashboardWidgetExtension {
  type: 'dashboardWidget';
  id: string;
  title: string;
  /** Component identifier the host resolves within the plugin bundle. */
  component: string;
  size: WidgetSize;
}

/** Adds a page nested under Settings. */
export interface SettingsPageExtension {
  type: 'settingsPage';
  id: string;
  title: string;
  component: string;
}

/** Receives a callback whenever a (matching) game launches. */
export interface GameLaunchHookExtension {
  type: 'gameLaunchHook';
  id: string;
  filter: GameLaunchFilter;
}

/** `manifest.json` located at `%APPDATA%/MVO Hub/plugins/<id>/manifest.json`. */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  /** Entry point relative to the plugin directory, e.g. `index.js`. */
  entryPoint: string;
  permissions: PluginPermissions;
  uiExtensions: UiExtension[];
}

/** Runtime state of a plugin as reported by `list_plugins`. */
export interface LoadedPlugin {
  manifest: PluginManifest;
  /** Absolute path of the plugin directory. */
  path: string;
  enabled: boolean;
}

/** UI hook registry reported by `get_plugin_hooks`. */
export interface PluginHooks {
  sidebarItems: SidebarItemHook[];
  dashboardWidgets: DashboardWidgetHook[];
  settingsPages: SettingsPageHook[];
  gameLaunchHooks: GameLaunchHookEntry[];
}

export interface SidebarItemHook extends Omit<SidebarItemExtension, 'type'> {
  pluginId: string;
}

export interface DashboardWidgetHook extends Omit<DashboardWidgetExtension, 'type'> {
  pluginId: string;
}

export interface SettingsPageHook extends Omit<SettingsPageExtension, 'type'> {
  pluginId: string;
}

export interface GameLaunchHookEntry extends Omit<GameLaunchHookExtension, 'type'> {
  pluginId: string;
}

export interface GameLaunchEvent {
  gameId: string;
  gameName: string;
  platform: string;
  executable: string;
}

/**
 * The object handed to a plugin at runtime. All methods are asynchronous and
 * may reject when the plugin lacks the relevant permission.
 */
export interface PluginApi {
  readonly pluginId: string;
  readonly permissions: PluginPermissions;

  /** Invoke a host command that the plugin is permitted to use. */
  invoke<T = unknown>(command: string, payload?: unknown): Promise<T>;

  /** Emit a namespaced event to the host (`plugin:<id>:<event>`). */
  emit(event: string, payload: unknown): void;

  /** Subscribe to a host event forwarded to this plugin. Returns an unsubscribe fn. */
  on<T = unknown>(event: string, handler: (payload: T) => void): () => void;

  /** Sandboxed filesystem helpers (require `canReadFiles` / `canWriteFiles`). */
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listFiles(path: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;

  /** Sandboxed process launch (requires `canLaunchProcesses`). */
  launchProcess(exe: string, args: string[]): Promise<void>;

  /** Outbound HTTP (requires `canAccessNetwork`). */
  httpRequest(url: string, method: string, headers: Record<string, string>, body?: string): Promise<string>;
}

/** A permission flag paired with its human-readable description. */
export interface PermissionDescriptor {
  key: keyof PluginPermissions;
  label: string;
  description: string;
  /** Flags that grant broader/riskier access; rendered with a warning tone. */
  sensitive: boolean;
}

/** Canonical, ordered permission catalogue used by the Settings > Plugins UI. */
export const PERMISSION_CATALOGUE: readonly PermissionDescriptor[] = [
  { key: 'canReadFiles', label: 'Read files', description: 'Read files inside its own plugin folder', sensitive: false },
  { key: 'canWriteFiles', label: 'Write files', description: 'Create or modify files inside its own plugin folder', sensitive: true },
  { key: 'canLaunchProcesses', label: 'Launch processes', description: 'Start executables shipped inside its plugin folder', sensitive: true },
  { key: 'canAccessNetwork', label: 'Network access', description: 'Make outbound HTTP requests', sensitive: true },
  { key: 'canAccessGameVault', label: 'GameVault', description: 'Query and modify your GameVault library', sensitive: false },
  { key: 'canAccessHardware', label: 'Hardware sensors', description: 'Read CPU, GPU, RAM and disk telemetry', sensitive: false },
  { key: 'canListenGameLaunch', label: 'Game launch events', description: 'React when a game starts or stops', sensitive: false },
  { key: 'canModifySidebar', label: 'Sidebar items', description: 'Add entries to the navigation sidebar', sensitive: false },
  { key: 'canAddDashboardWidgets', label: 'Dashboard widgets', description: 'Add widgets to the Home dashboard', sensitive: false },
];

/** Deny-all permission set. */
export const NO_PERMISSIONS: PluginPermissions = {
  canReadFiles: false,
  canWriteFiles: false,
  canLaunchProcesses: false,
  canAccessNetwork: false,
  canAccessGameVault: false,
  canAccessHardware: false,
  canListenGameLaunch: false,
  canModifySidebar: false,
  canAddDashboardWidgets: false,
};

/** Returns the catalogue entries a plugin has actually been granted. */
export function grantedPermissions(permissions: Partial<PluginPermissions> | undefined): PermissionDescriptor[] {
  if (!permissions) return [];
  return PERMISSION_CATALOGUE.filter(p => permissions[p.key] === true);
}
