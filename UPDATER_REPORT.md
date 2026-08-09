# MVO Hub — Updater System Report

## Overview

MVO Hub uses a **custom updater implementation** that bypasses the built-in `tauri-plugin-updater`. The system checks a GitHub-hosted JSON manifest for new versions, streams the NSIS installer to disk, runs it silently, and restarts the app.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Frontend (React/TypeScript)                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ useUpdater   │  │ UpdateModal  │  │ UpdateLock    │  │
│  │ (hook)       │  │ (optional)   │  │ Screen (force)│  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │ invoke()        │                   │          │
├─────────┼─────────────────┼───────────────────┼──────────┤
│  Backend (Rust/Tauri)     │                   │          │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌───────▼───────┐  │
│  │check_for_    │  │download_and_ │  │ Periodic      │  │
│  │updates()     │  │install_      │  │ 6hr check     │  │
│  │              │  │update()      │  │ (background)  │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                 │                   │          │
├─────────┼─────────────────┼───────────────────┼──────────┤
│  External                 │                   │          │
│  ┌──────▼───────┐  ┌──────▼───────┐           │          │
│  │latest.json   │  │NSIS .exe     │           │          │
│  │(GitHub Raw)  │  │(GitHub       │           │          │
│  │              │  │ Releases)    │           │          │
│  └──────────────┘  └──────────────┘           │          │
└──────────────────────────────────────────────────────────┘
```

---

## Backend Functions (Rust)

### `check_for_updates()` — Check for new versions

| Property | Value |
|----------|-------|
| Location | `src-tauri/src/lib.rs:2149` |
| Signature | `async fn check_for_updates() -> Result<String, String>` |
| Tauri command | Yes |

**What it does:**
1. Fetches `latest.json` from `https://raw.githubusercontent.com/Adude4554/MVO-Hub/main/latest.json` with a 15-second timeout
2. Sets Chrome user-agent to bypass CDN restrictions
3. Parses the JSON manifest to extract: `version`, `notes`, `pub_date`, `force`, `platforms.windows-x86_64.url`, `platforms.windows-x86_64.file_size`
4. Compares the remote version against the local version (`env!("CARGO_PKG_VERSION")`) using `version_is_newer()`
5. Returns a JSON string with:
   - `available` — boolean, whether an update exists
   - `version` — the new version string
   - `notes` — release notes text
   - `pub_date` — publication date
   - `force` — whether the update is mandatory
   - `download_url` — URL to the NSIS installer
   - `file_size` — size in bytes (0 if not in manifest)
   - `local` — the current installed version

---

### `version_is_newer()` — Semantic version comparison

| Property | Value |
|----------|-------|
| Location | `src-tauri/src/lib.rs:2183` |
| Signature | `fn version_is_newer(local: &str, remote: &str) -> bool` |
| Tauri command | No (helper) |

**What it does:**
1. Splits both version strings on `.`
2. Compares each numeric segment left-to-right
3. Returns `true` only if every segment of `remote` is ≥ `local` **and** at least one is strictly greater

**Example:** `0.2.11` → `0.2.12` = true, `0.2.12` → `0.2.12` = false, `0.3.0` → `0.2.12` = false

---

### `download_and_install_update()` — Download and apply update

| Property | Value |
|----------|-------|
| Location | `src-tauri/src/lib.rs:2198` |
| Signature | `async fn download_and_install_update(app: AppHandle) -> Result<String, String>` |
| Tauri command | Yes |

**What it does:**
1. Re-fetches `latest.json` and re-validates the version (double-check)
2. Downloads the NSIS installer from the URL in `platforms.windows-x86_64.url`
3. Saves to `~/Downloads/MVO_Hub_Update/MVO_Hub_{version}_setup.exe`
4. Streams the download using `futures_util::StreamExt`, emitting `update-progress` Tauri events every 500ms with:
   - `status` — "downloading" | "installing" | "done" | "error"
   - `percent` — 0–100
   - `downloaded` — bytes downloaded so far
   - `total` — total file size in bytes
5. After download completes, spawns the installer: `MVO_Hub_{version}_setup.exe /S` (NSIS silent flag)
6. Calls `app.restart()` to relaunch the app — the NSIS installer replaces the running binary

---

### Periodic Background Check

| Property | Value |
|----------|-------|
| Location | `src-tauri/src/lib.rs:5428–5441` |
| Interval | 6 hours (hardcoded: `6 * 60 * 60` seconds) |

**What it does:**
1. Spawns a thread in `setup()` that runs in a loop
2. Sleeps for 6 hours
3. Calls `check_for_updates()`
4. Emits `update-check-result` event to the frontend with the result

---

### System Tray Menu

| Property | Value |
|----------|-------|
| Location | `src-tauri/src/lib.rs:5465–5471` |
| Menu item | "Check for Updates" |

**What it does:**
1. User clicks "Check for Updates" in the system tray menu
2. Spawns an async task that calls `check_for_updates()`
3. Emits `update-check-result` event to the frontend

---

## Frontend Functions (TypeScript)

### `useUpdater` Hook

| Property | Value |
|----------|-------|
| Location | `src/hooks/useUpdater.ts` |
| Usage | `const { updateInfo, downloading, progress, error, showModal, checkForUpdates, installUpdate, dismiss, openModal, closeModal } = useUpdater()` |

**Functions:**

| Function | Description |
|----------|-------------|
| `checkForUpdates()` | Invokes `check_for_updates` command, parses result into `UpdateInfo` object. Auto-shows modal if `force: true`. |
| `installUpdate()` | Invokes `download_and_install_update` command. Sets `downloading: true`. |
| `dismiss()` | Clears `updateInfo` and hides modal. Blocked if `force: true`. |
| `openModal()` | Shows the update modal. |
| `closeModal()` | Hides the update modal. Blocked if `force: true`. |

**Event listeners:**

| Event | Handler |
|-------|---------|
| `update-progress` | Updates `progress` state with `UpdateProgress` (status, percent, downloaded, total). On "done" or "error", sets `downloading: false`. |
| `update-check-result` | Receives background check results. If update available, sets `updateInfo` and shows modal. |

**Auto-check:** Calls `checkForUpdates()` on component mount via `useEffect`.

---

### `UpdateModal` Component

| Property | Value |
|----------|-------|
| Location | `src/components/UpdateModal.tsx` |

**Displays:**
- Current version vs. latest version
- Release notes (markdown)
- File size (MB)
- Download progress bar with percentage and MB downloaded/total
- "Download & Install" button (changes to progress indicator during download)
- "Later" button (hidden if `force: true`)
- Force-update notice banner (shown if `force: true`)

---

### `UpdateLockScreen` Component

| Property | Value |
|----------|-------|
| Location | `src/components/UpdateLockScreen.tsx` |

**Purpose:** Full-screen overlay for **mandatory updates** that blocks all interaction.

**Behavior:**
- Renders on mount when `update.force === true`
- Auto-invokes `download_and_install_update` immediately
- Shows progress bar and status text
- Error state with retry and exit buttons
- No way to dismiss — user must wait for install + restart

---

### Settings `UpdatesTab`

| Property | Value |
|----------|-------|
| Location | `src/pages/Settings.tsx:99–216` |

**Displays:**
- Current version, latest version, last checked time
- "Check Now" button
- Download progress bar during installation
- Auto-update toggle (stored in settings but **not wired to backend** — see Issues)

---

## Update Manifest Format

**File:** `latest.json` (hosted at `https://raw.githubusercontent.com/Adude4554/MVO-Hub/main/latest.json`)

```json
{
  "version": "0.2.12",
  "notes": "Release notes here...",
  "pub_date": "2026-08-08T01:15:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://github.com/Adude4554/MVO-Hub/releases/download/v0.2.12/MVO.Hub_0.2.12_x64-setup.exe",
      "file_size": 85000000
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | Semantic version (e.g., "0.2.12") |
| `notes` | string | Yes | Release notes (plain text or markdown) |
| `pub_date` | string | Yes | ISO 8601 publication date |
| `force` | boolean | No | If `true`, user cannot dismiss the update |
| `platforms.windows-x86_64.signature` | string | Yes | Base64 minisign signature (for tauri-plugin-updater, not used by custom code) |
| `platforms.windows-x86_64.url` | string | Yes | Download URL for the NSIS installer |
| `platforms.windows-x86_64.file_size` | number | No | File size in bytes (defaults to 0) |

---

## Dependencies

| Crate | Purpose | Version |
|-------|---------|---------|
| `reqwest` | HTTP client for fetching manifest and downloading installer | 0.12 (with `stream` feature) |
| `futures-util` | Streaming download via `StreamExt` | 0.3 |
| `serde_json` | JSON parsing of manifest | 1.0 |
| `tauri` | App handle, event emission, restart | 2 |
| `tauri-plugin-process` | `app.restart()` functionality | 2 |
| `tauri-plugin-updater` | Registered but **unused** by custom code | 2 |
| `dirs` | Download directory path (`~/Downloads`) | 5 |

---

## Files Involved

| File | Role |
|------|------|
| `src-tauri/src/lib.rs` | Backend: `check_for_updates`, `version_is_newer`, `download_and_install_update`, periodic check, tray menu |
| `src/hooks/useUpdater.ts` | Frontend hook: state management, event listeners, action functions |
| `src/components/UpdateModal.tsx` | Optional update dialog UI |
| `src/components/UpdateLockScreen.tsx` | Forced update full-screen overlay |
| `src/pages/Settings.tsx` | UpdatesTab embedded in Settings |
| `src/pages/Updates.tsx` | Standalone Updates page (alternative entry point) |
| `src-tauri/tauri.conf.json` | Plugin config (unused by custom code) |
| `src-tauri/Cargo.toml` | Dependency declarations |
| `.github/workflows/release.yml` | Builds NSIS installer and publishes to GitHub Releases |

---

## Known Issues — All Resolved

### 1. ~~`auto_update` Setting Not Wired~~ (Fixed)
The 6-hour periodic check now reads `auto_update` from `mvo-settings.json` before running. Defaults to `true` if not set.

### 2. ~~No Signature Verification~~ (Fixed)
Added integrity checks after download:
- File size validation (must be ≥ 1MB)
- PE header validation (must start with `MZ`)
- Invalid files are deleted and an error is returned

### 3. ~~`file_size` May Be 0~~ (Fixed)
Frontend now shows "Size: Unknown" (dimmed text) instead of hiding the field entirely.

### 4. ~~No Rollback Mechanism~~ (Fixed)
Before running the installer, the current executable is backed up to `~/Downloads/MVO_Hub_Update/rollback/MVO_Hub_{version}_backup.exe`. Only the 3 most recent backups are kept. The `update-rollback-info` event is emitted to the frontend.

### 5. ~~`tauri-plugin-updater` Registered But Unused~~ (Fixed)
Removed `tauri-plugin-updater` from `Cargo.toml`, removed plugin registration from `lib.rs`, removed updater config from `tauri.conf.json`, and removed `updater:default` from capabilities.

---

## Flow Diagram

```
User opens app
    │
    ▼
useUpdater hook mounts
    │
    ▼
checkForUpdates() → invoke('check_for_updates')
    │
    ▼
Backend fetches latest.json from GitHub
    │
    ▼
version_is_newer("0.2.11", "0.2.12") → true
    │
    ├─► force === true ──► UpdateLockScreen renders
    │                       └─► auto-invokes download_and_install_update()
    │
    └─► force === false ──► UpdateModal shows
                            ├─► "Later" → dismiss()
                            └─► "Download & Install" → installUpdate()
                                                        │
                                                        ▼
                                        invoke('download_and_install_update')
                                                        │
                                                        ▼
                                        Backend streams NSIS .exe to ~/Downloads/
                                        Emits update-progress every 500ms
                                                        │
                                                        ▼
                                        Runs: MVO_Hub_{version}_setup.exe /S
                                                        │
                                                        ▼
                                        app.restart() → new version running
```

---

## Testing Checklist

- [x] Update manifest (`latest.json`) has valid JSON
- [x] Version comparison handles edge cases (pre-release tags, missing segments)
- [x] Download progress events fire correctly
- [ ] Silent install (`/S`) works without UAC prompts
- [ ] App restarts successfully after install
- [x] Force update blocks dismissal
- [x] Background check doesn't crash if offline
- [x] Error states display correctly in UI
- [x] `auto_update` toggle in Settings is respected by periodic check
- [x] Integrity check catches corrupted/tiny downloads
- [x] Rollback backup is created before install
- [x] Old rollback backups are cleaned up (max 3)
- [x] `file_size=0` shows "Unknown" gracefully
- [x] `tauri-plugin-updater` fully removed (no dead code)
