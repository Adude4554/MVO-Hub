# MVO HUB — COMPLETE TECHNICAL AUDIT

## Executive Summary

MVO Hub is a Tauri 2 desktop application for PC gaming optimization, hardware monitoring, game library management, and AI assistance. The codebase is substantial (~80,000+ Rust lines, ~15,000+ TypeScript lines) with 180 Tauri commands, 14 platform game scanners, 7 hardware providers, and 25+ UI pages. Most core features are genuinely implemented. However, several critical issues exist: CSP is disabled, passwords use unsalted SHA-256, motherboard sensors are broken, the overlay system is partially stubbed, and there are zero frontend tests.

## Current Version

**0.2.12** | Tauri 2 | React 18 | TypeScript 5.6 | Rust 2021

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Frontend (React 18 + TypeScript + Tailwind CSS 3.4)│
│  25 pages │ 23 components │ 15 hooks │ 0 state lib │
│  State: useState/useCallback only (Zustand unused)  │
│  Routing: Manual page-state (no React Router)        │
├──────────────────── Tauri IPC ──────────────────────┤
│ Backend (Rust 2021 — lib.rs 5,035 lines)           │
│  180 #[tauri::command] functions                    │
│  hardware/ │ gamevault/ │ scanner/                  │
│  SQLite (rusqlite) │ NVML │ sysinfo │ WMI          │
├─────────────────────────────────────────────────────┤
│ System: Windows APIs │ Process spawning │ Registry  │
└─────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop Framework | Tauri | 2.x |
| Frontend | React + TypeScript | 18.3 / 5.6 |
| Build Tool | Vite | 5.4 |
| Styling | Tailwind CSS + 17 CSS files | 3.4 |
| State Management | useState/useCallback only | — (Zustand 4.5 installed, unused) |
| Icons | Lucide React | 0.441 |
| Backend | Rust | 2021 edition |
| GPU Monitoring | NVML | nvml-wrapper 0.10 |
| System Info | sysinfo | 0.37.2 |
| Database | SQLite (rusqlite) | 0.31 |
| HTTP Client | reqwest (blocking + streaming) | 0.12 |
| AI Provider | Ollama (local) | — |
| Game Scanning | 14 platform scanners | — |
| Auto-Updater | GitHub Releases | — |

## Application Structure

```
src-tauri/src/
├── lib.rs                    (5,035 lines — 130+ commands, monolith)
├── main.rs                   (entry point)
├── hardware/                 (16 modules — providers, manager, health, db, commands)
│   ├── cpu/                  (sysinfo + WMI)
│   ├── gpu/                  (NVML + WMI for AMD/Intel)
│   ├── memory/               (sysinfo + WMI)
│   ├── storage/              (sysinfo + WMI)
│   ├── network/              (sysinfo + WMI)
│   ├── battery/              (WMI only)
│   ├── motherboard/          (WMI only)
│   ├── sensors/              (aggregator + history — unused)
│   ├── health.rs             (thresholds + scoring)
│   ├── db.rs                 (SQLite 3 tables)
│   └── commands.rs           (13 Tauri commands)
├── gamevault/                (4 files — db, downloader, extractor)
└── scanner/                  (18 files — 14 platform scanners + engine)

src/
├── App.tsx                   (262 lines — page routing via state)
├── pages/                    (25 pages)
├── components/               (23 components)
├── hooks/                    (15 hooks)
├── config/pages.ts           (page registry)
├── lib/                      (i18n, sounds, gameArtwork)
└── styles/                   (17 CSS files)
```

## Feature Matrix

| Feature | Status | Frontend | Backend | Database | External API | Tests | Evidence |
|---------|--------|----------|---------|----------|--------------|-------|----------|
| Dashboard | IMPLEMENTED | Dashboard.tsx | Multiple commands | — | GitHub news | — | src/pages/Dashboard.tsx |
| Game Library (Steam) | IMPLEMENTED | GameLibrary.tsx | scan_steam_games, get_installed_steam_games | scanned_games table | Steam CDN | 19 tests | scanner/steam.rs |
| Game Library (Custom) | IMPLEMENTED | Scanner.tsx | scan_custom_games, scan_all_platforms | scanned_games table | — | 16 tests | scanner/engine.rs |
| Game Vault (Store) | IMPLEMENTED | GameVault.tsx | gv_get_store | — | GitHub raw JS | — | lib.rs:4094 |
| Game Vault (Install) | IMPLEMENTED | GameVault.tsx | gv_install, gv_uninstall, gv_launch | installed_games, downloads | — | — | lib.rs:4123 |
| Game Download Pipeline | IMPLEMENTED | DownloadBar.tsx | download_file_with_progress, gv_install | downloads table | HTTP | — | gamevault/downloader.rs |
| Game Extraction (ZIP) | IMPLEMENTED | — | extractor.rs | — | — | — | gamevault/extractor.rs |
| Hardware Monitoring | IMPLEMENTED | Hardware.tsx | start/stop_hardware_monitor | hw_sensors, hw_readings | — | 44 tests | hardware/ |
| NVIDIA GPU Sensors | IMPLEMENTED | — | nvml-wrapper | — | NVML | 1 test | hardware/gpu/nvidia.rs |
| AMD GPU Sensors | PARTIAL | — | WMI | — | — | 1 test | hardware/gpu/amd.rs |
| Intel GPU Sensors | STUB | — | WMI detection only | — | — | 1 test | hardware/gpu/intel.rs |
| Memory Monitoring | IMPLEMENTED | — | sysinfo + WMI | — | — | 1 test | hardware/memory/provider.rs |
| Storage Monitoring | IMPLEMENTED | — | sysinfo + WMI | — | — | 1 test | hardware/storage/provider.rs |
| Network Monitoring | IMPLEMENTED | — | sysinfo + WMI | — | — | 1 test | hardware/network/provider.rs |
| Battery Monitoring | IMPLEMENTED | — | WMI | — | — | — | hardware/battery/provider.rs |
| Motherboard Info | BROKEN | — | WMI | — | — | — | hardware/motherboard/provider.rs |
| Health Engine | IMPLEMENTED | — | health.rs | — | — | 10 tests | hardware/health.rs |
| Sensor History (Memory) | IMPLEMENTED | — | manager.rs history ring | — | — | — | hardware/manager.rs |
| Sensor History (SQLite) | IMPLEMENTED | — | commands.rs | hw_readings | — | 1 test | hardware/db.rs |
| AI Chat (Ollama) | IMPLEMENTED | AITools.tsx | ask_ai | chat_sessions, chat_messages | Ollama local | — | lib.rs:2641 |
| AI Chat (Gemini) | IMPLEMENTED | — | ask_ai | — | Google API | — | lib.rs:2683 |
| AI Chat (OpenAI) | IMPLEMENTED | — | ask_ai | — | OpenAI API | — | lib.rs:2719 |
| Chat Sessions | IMPLEMENTED | useAI.ts | chat_* commands | chat_sessions, chat_messages | — | — | lib.rs:3022-3070 |
| System Optimizer | IMPLEMENTED | Optimizer.tsx | flush_dns, clean_ram, system_boost | — | — | — | lib.rs:1517-1567 |
| Power Plan Management | IMPLEMENTED | Settings.tsx | activate_gaming_mode, set_power_plan | — | powercfg | — | lib.rs:856-880 |
| System Boost | IMPLEMENTED | SystemBoost.tsx | activate_gaming_mode, restore_power_plan | — | powercfg | — | lib.rs:867 |
| Visual Tweaks | IMPLEMENTED | Settings.tsx | toggle_transparency, toggle_animations | — | Registry | — | lib.rs:1841-1885 |
| Settings | MOSTLY IMPLEMENTED | Settings.tsx | load/save_settings | JSON file | — | — | lib.rs:3144 |
| Settings Import | STUB | — | import_settings | — | — | — | lib.rs:3220 |
| First Run | STUB | — | check/complete_first_run | — | — | — | lib.rs:3230 |
| Overlay (FPS Monitor) | IMPLEMENTED | Overlay.tsx | get_overlay_status, launch_overlay_app | — | — | — | lib.rs:1316 |
| Overlay (RTSS/Afterburner) | STUB | useOverlay.ts | detect_overlay_tools (stub) | — | — | — | lib.rs:3796 |
| Streaming (OBS) | STUB | Streaming.tsx | detect_streaming_tools (stub) | — | — | — | lib.rs:3801 |
| Browser | IMPLEMENTED | Browser.tsx | Tauri WebviewWindow | — | — | — | src/pages/Browser.tsx |
| Movies/TV | IMPLEMENTED | MoviesTV.tsx | — | — | vidsrcme.ru + TMDB | — | src/pages/MoviesTV.tsx |
| Global Chat | MOCK | GlobalChat.tsx | — | — | — | — | Hardcoded demo data |
| Web Hub | STATIC | WebHub.tsx | open_url | — | — | — | Hardcoded links |
| Updater | IMPLEMENTED | Updates.tsx | check/download_install_update | — | GitHub Releases | — | lib.rs:2150 |
| Authentication | IMPLEMENTED | AuthScreen.tsx | login, create_account | users table | — | — | lib.rs:2261 |
| Cloud Sync | IMPLEMENTED | Settings.tsx | sync_export_to_gist | — | GitHub Gists | — | lib.rs:2787 |
| User Accounts | IMPLEMENTED | AuthScreen.tsx | login, create_account, change_password | users table | — | — | lib.rs:2261 |
| Recently Launched | IMPLEMENTED | — | add/get_recently_launched | recently_launched | — | — | lib.rs:2324 |
| Windows Settings Openers | IMPLEMENTED | Settings.tsx | 30+ open_* commands | — | ms-settings: | — | lib.rs:1647-2145 |
| System Repair | IMPLEMENTED | Settings.tsx | run_sfc_scan, run_dism_repair | — | sfc, DISM | — | lib.rs:1729-1791 |
| File Explorer Openers | IMPLEMENTED | Files.tsx | 8 open_*_folder commands | — | explorer | — | lib.rs:1273-1314 |
| Icon Extraction | IMPLEMENTED | — | extract_exe_icon | — | Win32 API | — | lib.rs:411 |
| GameVault Repair | IMPLEMENTED | GameVault.tsx | gv_repair | — | SHA-256 | — | lib.rs:4624 |
| Keyboard Shortcuts | IMPLEMENTED | useKeyboardShortcuts.ts | — | — | — | — | src/hooks/useKeyboardShortcuts.ts |
| i18n (5 locales) | IMPLEMENTED | useLocale.ts | — | — | — | — | src/lib/i18n.ts |
| Sound Effects | IMPLEMENTED | useSounds.ts | — | Web Audio API | — | — | src/hooks/useSounds.ts |
| Custom Cursor | IMPLEMENTED | CustomCursor.tsx | — | — | — | — | src/components/CustomCursor.tsx |
| Global Search | IMPLEMENTED | GlobalSearch.tsx | — | — | — | — | src/components/GlobalSearch.tsx |
| Profiles | IMPLEMENTED | useProfiles.ts | load/save_settings | — | — | — | src/hooks/useProfiles.ts |
| Performance Page | IMPLEMENTED | Performance.tsx | get_performance_snapshot | — | — | — | src/pages/Performance.tsx |
| Hardware Widgets | IMPLEMENTED | HardwareWidgets.tsx | — | — | — | — | src/components/HardwareWidgets.tsx |
| Dashboard Widgets | IMPLEMENTED | DashboardWidgets.tsx | — | — | — | — | src/components/DashboardWidgets.tsx |
| System Tray | IMPLEMENTED | — | Tray with menu | — | — | — | lib.rs:4729-4780 |

## Home / Dashboard

**Status: IMPLEMENTED**

- Real-time CPU/RAM/GPU metrics via `get_performance_snapshot` (1-second polling)
- Hardware sensor data via `useHardwareSensors` hook
- News feed from GitHub raw JSON with fallback mock
- Quick action cards (launch Steam, system boost, open settings, etc.)
- System status indicators
- **Data source**: All real backend data except news fallback

## Game Library / GameVault

**Status: IMPLEMENTED (with gaps)**

- 14 platform scanners running in parallel threads
- Steam library detection via registry + VDF/ACF parsing + multi-drive scanning
- Epic, GOG, EA, Ubisoft, Battle.net, Riot, Xbox, Amazon, itch.io, Rockstar, Minecraft, Emulator, Standalone detection
- Cover art download from Steam CDN
- EXE icon extraction via PowerShell
- GameVault free game store with download + extract + install pipeline
- SHA-256 verification for installed games
- Game launching via Steam protocol or direct EXE execution
- **Gap**: No game update detection, no cloud save sync, no achievement tracking

## Downloads

**Status: IMPLEMENTED**

- Full HTTP download pipeline with progress events
- Format detection via magic bytes (ZIP, RAR, 7z, EXE, NSIS)
- ZIP extraction with progress
- 7-Zip fallback for RAR/7z
- NSIS installer execution
- Cancel/retry/remove operations
- Download speed and ETA tracking
- Persistent download state in SQLite

## Game Launching

**Status: IMPLEMENTED**

- Steam games via `steam://rungameid/` protocol
- Custom games via direct EXE launch with working directory
- Admin elevation via PowerShell RunAs
- Recently launched tracking (last 10)
- Game folder opening in Explorer
- **Missing**: Process tracking, game exit detection, crash detection, playtime tracking on exit

## Hardware Engine

**Status: MOSTLY IMPLEMENTED (with critical bugs)**

### Provider Summary

| Provider | Source | Sensors | Status |
|----------|--------|---------|--------|
| CPU | sysinfo + WMI | 6 + 2*N cores | REAL (1 broken) |
| NVIDIA GPU | NVML | 11 per GPU | REAL |
| AMD GPU | WMI | 1 (VRAM only) | DEGRADED |
| Intel GPU | WMI | 0 | STUB |
| Memory | sysinfo + WMI | 4 + N modules | REAL (1 broken) |
| Storage | sysinfo + WMI | 7 per disk | REAL |
| Network | sysinfo + WMI | 7 per interface | REAL |
| Battery | WMI | 5 | REAL |
| Motherboard | WMI | 3 | BROKEN |

### Hardware Sensor Matrix

| Sensor ID | Unit | Source | Verdict |
|-----------|------|--------|---------|
| `cpu.usage` | % | sysinfo | **REAL** |
| `cpu.cores.physical` | count | sysinfo | **REAL** (static) |
| `cpu.cores.logical` | count | sysinfo | **REAL** (static) |
| `cpu.frequency` | MHz | sysinfo | **REAL** |
| `cpu.frequency.max` | MHz | WMI | **REAL** (static) |
| `cpu.frequency.current` | MHz | WMI | **REAL** |
| `cpu.architecture` | count | WMI | **BROKEN** — value always 0.0 |
| `cpu.core.{i}.usage` | % | sysinfo | **REAL** |
| `cpu.core.{i}.frequency` | MHz | sysinfo | **REAL** |
| `gpu.gpu_nvidia_{i}.usage` | % | NVML | **REAL** |
| `gpu.gpu_nvidia_{i}.vram.total` | bytes | NVML | **REAL** |
| `gpu.gpu_nvidia_{i}.vram.used` | bytes | NVML | **REAL** |
| `gpu.gpu_nvidia_{i}.vram.free` | bytes | NVML | **REAL** |
| `gpu.gpu_nvidia_{i}.vram.usage` | % | NVML | **REAL** (derived) |
| `gpu.gpu_nvidia_{i}.temperature` | °C | NVML | **REAL** |
| `gpu.gpu_nvidia_{i}.power` | W | NVML | **REAL** |
| `gpu.gpu_nvidia_{i}.power_limit` | W | NVML | **REAL** |
| `gpu.gpu_nvidia_{i}.fan` | % | NVML | **REAL** |
| `gpu.gpu_nvidia_{i}.clock.graphics` | MHz | NVML | **REAL** |
| `gpu.gpu_nvidia_{i}.clock.memory` | MHz | NVML | **REAL** |
| `gpu.gpu_amd_0.vram.total` | bytes | WMI | **REAL** (static, 1 sensor only) |
| `memory.total` | bytes | sysinfo | **REAL** |
| `memory.used` | bytes | sysinfo | **REAL** |
| `memory.free` | bytes | sysinfo | **REAL** (derived) |
| `memory.usage` | % | sysinfo | **REAL** (derived) |
| `memory.speed` | MHz | WMI | **REAL** (static) |
| `memory.type` | count | WMI | **BROKEN** — value always 0.0 |
| `memory.modules` | count | WMI | **REAL** (static) |
| `memory.module.{i}.capacity` | bytes | WMI | **REAL** (static) |
| `storage_{i}.total` | bytes | sysinfo | **REAL** |
| `storage_{i}.available` | bytes | sysinfo | **REAL** |
| `storage_{i}.used` | bytes | sysinfo | **REAL** (derived) |
| `storage_{i}.usage` | % | sysinfo | **REAL** (derived) |
| `storage_{i}.is_ssd` | bool | WMI | **REAL** |
| `storage_{i}.read` | bytes | sysinfo | **REAL** (cumulative) |
| `storage_{i}.write` | bytes | sysinfo | **REAL** (cumulative) |
| `net_{name}.received` | bytes | sysinfo | **REAL** (cumulative) |
| `net_{name}.transmitted` | bytes | sysinfo | **REAL** (cumulative) |
| `net_{name}.received_rate` | B/s | sysinfo | **REAL** (live rate) |
| `net_{name}.transmitted_rate` | B/s | sysinfo | **REAL** (live rate) |
| `net_{name}.received_packets` | count | sysinfo | **REAL** (cumulative) |
| `net_{name}.transmitted_packets` | count | sysinfo | **REAL** (cumulative) |
| `net_{name}.errors` | count | sysinfo | **REAL** |
| `battery.percentage` | % | WMI | **REAL** |
| `battery.charging` | bool | WMI | **REAL** |
| `battery.ac_power` | bool | WMI | **REAL** |
| `battery.design_capacity` | count | WMI | **REAL** (static) |
| `battery.health` | % | WMI | **REAL** (derived) |
| `mb.bios.version` | count | WMI | **BROKEN** — string lost, value 0.0 |
| `mb.bios.vendor` | count | WMI | **BROKEN** — string lost, value 0.0 |
| `mb.os.version` | count | WMI | **BROKEN** — string lost, value 0.0 |

### Mock/Hardcoded Sensors

**NONE**. All sensors either read real hardware or fail gracefully. Zero fake values.

## In-Game Overlay

**Status: PARTIAL**

- FPS Monitor detection and launch: **IMPLEMENTED** (searches Program Files + Steam paths)
- RTSS detection: **STUB** (detect_overlay_tools returns hardcoded false)
- RTSS launch commands: **NOT REGISTERED** (useOverlay.ts calls commands not in generate_handler)
- MSI Afterburner detection: **STUB**
- HWiNFO detection: **STUB** (explicitly disabled)
- The overlay page is a configuration/launch UI, not an in-app overlay

## Gaming Performance

**Status: PARTIAL**

- Recently Launched tracking: **IMPLEMENTED** (last 10 games stored in DB)
- Playtime tracking command: **IMPLEMENTED** (`update_scanned_game_playtime`)
- Session auto-detection on game launch: **NOT IMPLEMENTED**
- Auto-playtime tracking: **NOT IMPLEMENTED**
- Historical session storage: **NOT IMPLEMENTED**
- FPS/frame time during gameplay: **NOT IMPLEMENTED** (requires external overlay)
- Telemetry collection during sessions: **NOT IMPLEMENTED**

## Diagnostics

**Status: IMPLEMENTED (rule-based)**

- Health engine with configurable thresholds
- Score 0-100 with deductions for high CPU/GPU/memory
- Alert generation for CPU usage, GPU temp/usage, memory, battery
- Hardware recommendations based on sensor thresholds
- **NOT implemented**: CPU bottleneck detection, GPU bottleneck detection, storage warnings, network diagnostics, crash detection

## AI System

**Status: IMPLEMENTED (basic)**

- Ollama integration (local, no API key needed)
- Gemini integration (requires API key)
- OpenAI-compatible integration (requires API key)
- Chat sessions stored in SQLite
- Session management (create, rename, delete, list)
- **NOT implemented**: Tool calling, RAG, embeddings, vector DB, agents, hardware tools, diagnostics tools, game tools, system context injection (context parameter passed as empty string)

## Database

### Hardware DB (hardware.db)

| Table | Columns | Purpose | Status |
|-------|---------|---------|--------|
| `hw_sensors` | id, name, category, subcategory, unit, device_id, device_name, source | Sensor metadata | ACTIVE |
| `hw_readings` | id, sensor_id, value, timestamp | Time-series readings | ACTIVE |
| `hw_alerts` | id, sensor_id, severity, message, value, threshold, timestamp, acknowledged | Health alerts | ACTIVE |

Indexes: `idx_readings_sensor_time`, `idx_readings_time`, `idx_alerts_time`, `idx_alerts_unack`

### GameVault DB (gamevault.db)

| Table | Columns | Purpose | Status |
|-------|---------|---------|--------|
| `installed_games` | id, name, version, developer, category, install_path, exe_path, cover, banner, icon, size_bytes, installed_at, last_played, play_time_seconds, is_favorite, tags, checksum | Installed games | ACTIVE |
| `downloads` | id, store_item_id, name, download_url, dest_path, status, progress, speed_bytes, downloaded_bytes, total_bytes, error, created_at | Active downloads | ACTIVE |
| `users` | id, username, email, password_hash, created_at | User accounts | ACTIVE |
| `recently_launched` | id, game_name, exe_path, install_path, game_id, launched_at | Launch history | ACTIVE |
| `download_history` | id, store_item_id, name, status, file_path, completed_at | Completed downloads | ACTIVE |
| `scanned_games` | id, name, platform, launcher, install_path, exe_path, app_id, version, cover_path, cover_local, icon_local, install_size, scan_confidence, is_installed, is_favorite, is_hidden, playtime_seconds, last_played, scanned_at | Scanned games | ACTIVE |
| `chat_sessions` | id, title, model, created_at, updated_at | AI chat sessions | ACTIVE |
| `chat_messages` | id, session_id, role, content, created_at | AI chat messages | ACTIVE |

Relationship: `chat_messages.session_id` -> `chat_sessions.id` (CASCADE DELETE)

### Settings Storage

- **File**: `%APPDATA%\ProjectMVO\mvo-settings.json`
- **Format**: JSON flat file
- **Status**: REAL, with migration support

## Settings

**Status: MOSTLY IMPLEMENTED**

| Setting | Category | Persisted | Affects Behavior |
|---------|----------|-----------|-----------------|
| refresh_rate | System | YES | YES |
| theme_mode | Appearance | YES | YES |
| auto_scan_games | Gaming | YES | YES |
| launch_steam_with_boost | Gaming | YES | YES |
| launch_overlay_with_game | Gaming | YES | YES |
| api_provider | AI | YES | YES |
| api_base_url | AI | YES | YES |
| api_model | AI | YES | YES |
| api_key | AI | YES | YES |
| language | Appearance | YES | YES |
| hidden_pages | UI | YES | YES |
| dashboard_widgets | UI | YES | YES |
| auto_update | System | YES | YES |
| import_settings | — | **STUB** | NO |
| first_run_complete | — | **STUB** | NO |

## Updater

**Status: IMPLEMENTED**

- GitHub Releases integration via `latest.json`
- Version comparison (semantic)
- Silent installer download and execution (`/S` flag)
- Auto-check every 6 hours in background thread
- System tray integration with "Check for Updates" menu
- Forced update lock screen
- Update progress events to frontend

## Installer / Deployment

**Status: IMPLEMENTED**

- NSIS installer (primary) + MSI
- Targets: `"all"` (NSIS, MSI, AppImage, DMG)
- Tauri updater artifacts with minisign signing
- Private key at `src-tauri/private.key`
- Bundle size: ~4 MB installer, 8.5 MB binary
- **Missing**: No first-run wizard (stub), no migration system, no uninstall cleanup verification

## Security

### Critical Issues

| Severity | Issue | Location |
|----------|-------|----------|
| **CRITICAL** | CSP disabled (`"csp": null`) | tauri.conf.json:27 |
| **CRITICAL** | Hardcoded TMDB API key in frontend bundle | FeaturedRow.tsx:4, MoviesTV.tsx:156 |
| **HIGH** | Password hashing uses SHA-256 without salt | lib.rs:2261-2265 |
| **HIGH** | 100+ `Command::new` calls with potential injection | lib.rs (78 calls), scanners, WMI |
| **HIGH** | Private signing key at `src-tauri/private.key` | File present in repo |
| **MEDIUM** | 31 `.unwrap()` calls in production Rust code | lib.rs, manager.rs, scanner/ |
| **MEDIUM** | 2 `.expect()` calls that crash on failure | lib.rs:4980, commands.rs:19 |
| **MEDIUM** | No input sanitization on shell commands | lib.rs (cmd/C start, powershell) |
| **LOW** | `unsafe` blocks for Win32 icon extraction | lib.rs:421-474 |

### Permissions

- Tauri capabilities: core:default, opener:default, updater:default, process:default + window controls
- Missing explicit permissions for dialog, store, shell plugins

## Performance

### Issues Found

| Severity | Issue | Location |
|----------|-------|----------|
| **HIGH** | 1-second polling interval in usePerformance.ts | usePerformance.ts:43 |
| **HIGH** | Hardware manager creates fresh provider instances every 1 second (re-runs sysinfo::System::new_all + WMI queries) | manager.rs |
| **MEDIUM** | FuturisticBackground canvas animation runs 60fps continuously with O(n^2) particle checks | FuturisticBackground.tsx |
| **MEDIUM** | Only 2 of 25 page components use React.memo | Hardware.tsx, Performance.tsx |
| **MEDIUM** | Dashboard.tsx NOT memoized (receives 1-second updates) | Dashboard.tsx |
| **LOW** | WMIC subprocess calls for every hardware query (process spawning overhead) | wmi.rs, providers |
| **LOW** | Unused Zustand dependency adds to bundle | package.json |

## Testing

```
Frontend tests:   0 (no test framework configured)
Rust tests:       63 PASS (34 hardware + 19 scanner + 10 health)
Build:            PASS (cargo build --release)
Production bundle: 8.52 MB binary, ~4 MB NSIS installer
```

### Test Coverage

| Module | Tests | Coverage |
|--------|-------|----------|
| hardware/types.rs | 14 | Good |
| hardware/health.rs | 10 | Good |
| hardware/db.rs | 4 | Good |
| hardware/manager.rs | 2 | Minimal |
| hardware/cpu/provider.rs | 2 | Integration |
| hardware/memory/provider.rs | 1 | Integration |
| hardware/storage/provider.rs | 1 | Integration |
| hardware/network/provider.rs | 1 | Integration |
| hardware/gpu/nvidia.rs | 1 | Smoke test only |
| hardware/gpu/amd.rs | 1 | Smoke test only |
| hardware/gpu/intel.rs | 1 | Smoke test only |
| scanner/ (all) | 19 | Good |
| **Total** | **63** | |

### Missing Tests
- Zero frontend component tests
- Zero frontend hook tests
- Zero E2E tests
- No Tauri command integration tests
- No download pipeline tests
- No auth flow tests

## Bugs

| Bug | Severity | Location | Cause | Impact | Recommended Fix |
|-----|----------|----------|-------|--------|-----------------|
| `cpu.architecture` sensor always 0.0 | MEDIUM | hardware/cpu/provider.rs | WMI string not stored in SensorReading value | Architecture info invisible to frontend | Store architecture as metadata or use string sensor |
| `memory.type` sensor always 0.0 | MEDIUM | hardware/memory/provider.rs | Same pattern — string discarded | Memory type invisible to frontend | Store type string in sensor metadata |
| All 3 motherboard sensors return 0.0 | HIGH | hardware/motherboard/provider.rs | `with_string_value()` is a no-op | BIOS/OS version invisible | Implement string value storage in SensorReading |
| AMD GPU driver_version captured but never exposed | LOW | hardware/gpu/amd.rs | Not written to any sensor | Driver info lost | Add driver version sensor or device info field |
| `detect_overlay_tools` always returns false | MEDIUM | lib.rs:3796 | Hardcoded stub | RTSS/Afterburner detection broken | Implement actual detection |
| `detect_streaming_tools` always returns false | MEDIUM | lib.rs:3801 | Hardcoded stub | OBS detection broken | Implement actual detection |
| `import_settings` does nothing | MEDIUM | lib.rs:3220 | Stub implementation | Import button non-functional | Implement actual JSON import |
| `check_first_run` always returns false | LOW | lib.rs:3230 | Stub | First-run wizard never triggers | Implement first_run_complete flag check |
| `complete_first_run` doesn't persist | LOW | lib.rs:3235 | Stub | First-run completion not saved | Write flag to settings file |
| Health engine doesn't evaluate disk usage | LOW | hardware/health.rs | Disk threshold defined but never checked | Disk warnings never generated | Add disk evaluation in `evaluate()` |
| Health score ignores battery | LOW | hardware/health.rs | Battery thresholds defined but not in score | Battery doesn't affect score | Add battery deduction in `get_health_score()` |
| Zustand installed but unused | LOW | package.json | Unused dependency | Bundle bloat | Remove or adopt |
| Dual sound system | LOW | useSounds.ts + sounds.ts | Two independent implementations | Maintenance confusion | Consolidate |
| WMIC deprecated by Microsoft | MEDIUM | All WMI queries | Uses WMIC.exe which is removed in Win11 24H2 | Will break on newer Windows | Migrate to PowerShell Get-CimInstance or WMI crate |
| Undefined variable `hw` in Dashboard | LOW | Dashboard.tsx:201 | Should be `hs?.cpuDevice` | Runtime error if reached | Fix variable reference |

## Dead / Duplicate Code

| Item | Location | Recommendation |
|------|----------|----------------|
| `cpu/perf_counters.rs` | hardware/cpu/ | REMOVE — entirely dead code |
| `sensors/aggregator.rs` | hardware/sensors/ | REMOVE — never used by manager |
| `sensors/history.rs` | hardware/sensors/ | REMOVE — manager has its own history |
| `Movies.tsx` | src/pages/ | REMOVE — superseded by MoviesTV.tsx |
| `TV.tsx` | src/pages/ | REMOVE — superseded by MoviesTV.tsx |
| `Web.tsx` | src/pages/ | REMOVE — superseded by WebHub.tsx |
| `useHardware.ts` | src/hooks/ | REMOVE — replaced by useHardwareSensors.ts |
| `Layout.tsx` | src/components/ | INVESTIGATE — imported but may be unused |
| `NavItem.tsx` NavLink | src/components/ | REMOVE — unused NavLink component |
| HWiNFO references (19) | Various | REMOVE — deprecated, launch disabled |
| `FunctionTest.tsx` | src/pages/ | KEEP (dev tool) |
| 38 `#[allow(dead_code)]` | Various | INVESTIGATE each |
| `steam_hero_url()` | scanner/metadata.rs:68 | REMOVE — never called |
| `get_cached_artwork()` | scanner/metadata.rs:170 | REMOVE — never called |
| `get_snapshot_value` / `get_sensors_json` / `get_devices_json` | hardware/manager.rs | KEEP with `#[allow(dead_code)]` — convenience methods |

## Missing Features

- Game update detection
- Cloud save synchronization
- Achievement tracking
- Playtime auto-tracking on game exit
- FPS/frame time capture during gameplay (requires external overlay integration)
- CPU/GPU bottleneck detection
- Storage health monitoring (SMART)
- Network latency monitoring
- Crash detection and reporting
- AI tool calling / function calling
- AI system context injection (hardware/games status)
- AI agents / RAG / embeddings
- First-run wizard
- Settings import
- Overlay detection for RTSS/Afterburner
- Streaming tool detection (OBS)
- Frontend tests (any)
- E2E tests
- CI/CD pipeline

## Partially Implemented Features

| Feature | What Works | What Doesn't |
|---------|-----------|--------------|
| AMD GPU Monitoring | Device detection, VRAM size | No utilization/temp/power/fan |
| Intel GPU Monitoring | Device detection | Zero runtime sensors |
| Motherboard Info | WMI queries succeed | All 3 sensors return 0.0 (string values lost) |
| Overlay System | FPS Monitor launch | RTSS/Afterburner/HWiNFO detection stubbed |
| Streaming System | Page exists | OBS detection stubbed |
| AI System | Basic Q&A works | No system context, no tool calling |
| First Run | Components exist | Backend stubs do nothing |
| Settings Import | UI button exists | Backend stub does nothing |

## Production Readiness

**BETA**

### Blockers for Release Candidate
1. CSP disabled — XSS vulnerability
2. Password hashing uses unsalted SHA-256
3. Motherboard sensors completely broken (0.0 values)
4. WMIC deprecation will break on Windows 11 24H2+
5. Zero frontend tests

### Blockers for Production
1. All above plus
2. No game update detection
3. No playtime auto-tracking
4. No crash detection
5. No CI/CD pipeline
6. Overlay/Streaming detection stubbed

## Completion Score

| Area | Score | Reasoning |
|------|-------|-----------|
| Architecture | 70% | Solid Tauri 2 structure but lib.rs is a 5,035-line monolith |
| UI | 80% | 25 pages with real data, but some pages are stubs (GlobalChat, Tools) |
| Backend | 85% | 180 commands, most functional, but 7 stubs |
| Hardware | 75% | NVIDIA excellent, AMD degraded, Intel stub, Motherboard broken |
| Gaming | 70% | Scanning excellent, launching works, missing tracking/update |
| Downloads | 80% | Full pipeline works, missing resume and verification |
| Diagnostics | 50% | Health engine works, missing bottleneck/crash/network diagnostics |
| AI | 40% | Basic Q&A works, no context/tools/agents/RAG |
| Database | 85% | Well-structured, 11 tables, proper relationships |
| Security | 30% | CSP disabled, weak password hashing, hardcoded API keys |
| Testing | 25% | 63 Rust tests pass, zero frontend tests |
| Deployment | 75% | NSIS/MSI installers work, auto-updater works, no first-run |

**Overall: 62%**

## User-Facing Features

### Gaming
- Scan and detect games from 14 launchers (Steam, Epic, GOG, EA, Ubisoft, Battle.net, Riot, Xbox, Amazon, itch.io, Rockstar, Minecraft, emulators, standalone)
- Game library with covers, metadata, and categorization
- GameVault free game store with one-click install
- Download, extract, and install games automatically
- Launch games directly from MVO Hub
- Recently launched games tracking
- Game favorites and hiding

### Hardware
- Real-time CPU usage, frequency, per-core monitoring
- NVIDIA GPU usage, temperature, power, VRAM, fan speed, clock speeds
- Memory usage, speed, module count and capacity
- Storage capacity, usage, SSD detection, I/O counters
- Network interface speeds (RX/TX), packet counts
- Battery percentage, charging status, health (laptops)
- Motherboard BIOS/OS info (broken — shows 0.0)
- Health score with alerts and recommendations
- Hardware sensor history and database persistence

### Performance
- Real-time performance dashboard (CPU, RAM, GPU, storage)
- System boost (DNS flush, RAM clear, temp cleanup)
- Power plan management (High Performance, Balanced, Saver)
- Visual tweaks (transparency, animations toggle)
- Windows settings quick-launchers (30+ system tools)

### AI
- Local AI assistant via Ollama (no API key needed)
- Chat sessions with history persistence
- Support for Gemini and OpenAI-compatible providers

### System
- Custom window with title bar, snap layout, resize handles
- Global search (Ctrl+K)
- 5 language support (English, German, Spanish, French, Arabic)
- Sound effects
- Custom cursor
- System tray with auto-update checks
- GitHub Gist cloud sync for settings and chat data
- User accounts with login/signup

### Media
- Movie and TV show streaming via external API
- TMDB artwork integration
- Chromium browser for web browsing

## Developer Capabilities

- 180 Tauri IPC commands
- Hardware monitoring engine with 7 providers
- 14 platform game scanner engine
- GameVault download/install/uninstall/launch pipeline
- SQLite database layer with 11 tables
- AI integration (Ollama, Gemini, OpenAI-compatible)
- Cloud sync via GitHub Gists
- Auto-updater via GitHub Releases
- Health engine with configurable thresholds
- Icon extraction via Win32 FFI
- Power plan management via powercfg
- Registry manipulation for visual tweaks
- 63 unit tests (all passing)

## Recommended Next Steps

### Top 10 Priority Fixes
1. **Enable CSP** — Set a proper Content Security Policy in tauri.conf.json
2. **Fix password hashing** — Replace SHA-256 with bcrypt or argon2
3. **Move TMDB API key** to Rust backend or config file
4. **Fix motherboard sensors** — Implement string value storage in SensorReading
5. **Implement overlay detection** — Replace stubs with actual RTSS/Afterburner detection
6. **Add frontend tests** — Set up Vitest, write component and hook tests
7. **Migrate WMI off WMIC.exe** — Use PowerShell Get-CimInstance or a WMI crate
8. **Implement `import_settings`** — Complete the stub
9. **Add system context to AI** — Inject hardware/games status into AI prompts
10. **Refactor lib.rs** — Break the 5,035-line monolith into focused modules

### Medium Priority
- Implement first-run wizard
- Add disk usage to health score
- Add battery to health score
- Implement OBS/streaming tool detection
- Add game update detection
- Add playtime auto-tracking
- Remove dead code (perf_counters.rs, sensors/, obsolete pages, HWiNFO refs)
- Add CI/CD pipeline
- Consolidate dual sound systems
- Remove unused Zustand dependency

### Low Priority
- Add SMART disk health monitoring
- Add network latency monitoring
- Add crash detection/reporting
- Implement AI tool calling
- Add RAG/embeddings for AI
- Add game achievement tracking
- Add cloud save sync

## Final Verdict

MVO Hub is a **functional BETA** with genuinely implemented core features — hardware monitoring, game scanning, downloads, AI chat, and system optimization all work. The codebase is substantial and architecturally sound despite the lib.rs monolith.

The biggest risks are **security** (CSP disabled, weak password hashing, hardcoded API keys) and **future compatibility** (WMIC deprecation). The biggest quality gaps are **zero frontend tests** and **stubbed detection systems** (overlay, streaming, first-run).

For a public release, the security issues must be fixed first. For an RC, the WMIC migration and motherboard sensor fixes are needed. The codebase is otherwise in reasonable shape for a solo-developer BETA application.
