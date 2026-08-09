# MVO Hub Custom Updater — Documentation

## Architecture

MVO Hub uses a **custom updater implementation** rather than the built-in `tauri-plugin-updater`. This decision was made to maintain full control over the update flow, validation steps, and user experience.

### Components

| Layer | File | Responsibility |
|-------|------|---------------|
| Rust backend | `src-tauri/src/updater.rs` | Core update logic: manifest fetch, version comparison, download, SHA-256 verification, PE header check, installer launch |
| Rust integration | `src-tauri/src/lib.rs` (lines 5317–5334, 5345–5405, 5605–5606) | Registers Tauri commands, spawns background check thread, builds system tray menu |
| React hook | `src/hooks/useUpdater.ts` | Frontend state machine: check, download, progress, modal/lock screen state |
| React modal | `src/components/UpdateModal.tsx` | Non-force update dialog (dismissable) |
| React lock screen | `src/components/UpdateLockScreen.tsx` | Force update overlay (non-dismissable, blocks all interaction) |
| Settings hook | `src/hooks/useSettings.ts` | `auto_update` boolean in `AppSettings` |
| Settings UI | `src/pages/Settings.tsx` (line 686) | Checkbox to toggle `auto_update` |
| App entry | `src/App.tsx` (lines 175–177, 255–266) | Renders `UpdateLockScreen` for force updates, `UpdateModal` for optional updates |
| Manifest | `latest.json` (repo root) | Current version metadata hosted on GitHub Raw |

### Hosting

- **Installer binaries**: GitHub Releases (`https://github.com/Adude4554/MVO-Hub/releases/download/v{VERSION}/...`)
- **Manifest file**: GitHub Raw (`https://raw.githubusercontent.com/Adude4554/MVO-Hub/main/latest.json`)
- No custom update server required

---

## Update Flow

### 1. Startup Check
- `useUpdater` hook calls `check_for_updates` on mount (`useEffect` in `useUpdater.ts:122`)
- Frontend `checkingRef` prevents duplicate simultaneous checks

### 2. Background Periodic Check
- Spawned in `lib.rs:5318–5333` during app setup
- Runs every **6 hours** (`6 * 60 * 60` seconds)
- Calls `updater::should_auto_check()` before each check — reads `auto_update` from settings
- If auto-update is disabled, skips the check silently
- Emits `update-check-result` event to frontend on completion

### 3. Manual Check Triggers
- **Settings "Check Now"**: Frontend calls `check_for_updates` command
- **System tray "Check for Updates"**: Tray menu event handler at `lib.rs:5381–5387` calls `updater::check_for_updates()`
- Manual checks always work regardless of `auto_update` setting

### 4. Manifest Fetch
- URL read from settings `update_url` field, defaults to `https://raw.githubusercontent.com/YourOrg/MVO-Hub/main/update.json`
- 30-second timeout on manifest request
- Response parsed into `UpdateManifest` struct

### 5. Version Comparison
- `is_version_newer(local, remote)` in `updater.rs:191`
- Semantic versioning with pre-release support (e.g., `0.2.0-beta` < `0.2.0`)
- Strict: remote must be strictly greater than local
- Pre-release versions (`-alpha`, `-beta`, `-rc`) are older than the same version without a pre-release tag
- Malformed local version treated as "old" (allows update); malformed remote treated as "not newer"

### 6. Update Available
- **Non-force**: `UpdateModal` shown (user can dismiss)
- **Force** (`force: true` in manifest): `UpdateLockScreen` shown immediately, blocks entire app

### 7. Download
- Streams to `.part` file in `%LOCALAPPDATA%/MVO Hub/`
- Filename: `MVO_Hub_{VERSION}_setup.exe.part`
- 300-second timeout
- Progress events emitted every 500ms via `update-progress` Tauri event

### 8. Integrity Verification
Three-layer check in `check_file_integrity()` (`updater.rs:307–342`):

1. **File size**: Must be ≥ 1 MB; if manifest specifies `file_size`, must match exactly
2. **PE header**: First two bytes must be `MZ` (valid Windows executable)
3. **SHA-256**: If manifest includes `sha256`, computed hash must match (case-insensitive hex comparison)

### 9. Post-Download
- `.part` file renamed to final name (e.g., `MVO_Hub_0.2.13_setup.exe`)
- Installer launched via `cmd /C start "" "/WAIT" {path}` (`updater.rs:614–616`)
- State transitions to `Idle` after launch

### 10. App Restart
- `UpdateLockScreen` component shows "Update installed. Restarting..." message
- Frontend calls `app.restart()` via Tauri process plugin after installer completes

---

## Manifest Format

```json
{
  "version": "0.2.13",
  "notes": "Bug fixes and improvements",
  "pub_date": "2025-01-15T12:00:00Z",
  "force": false,
  "platforms": {
    "windows-x86_64": {
      "url": "https://github.com/Adude4554/MVO-Hub/releases/download/v0.2.13/MVO.Hub_0.2.13_x64-setup.exe",
      "file_size": 85000000,
      "sha256": "a1b2c3d4e5f6...",
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6..."
    }
  }
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | Semantic version (e.g., `0.2.13`) |
| `notes` | string | Yes | Release notes displayed to user |
| `pub_date` | string | Yes | ISO 8601 publish date |
| `force` | bool | No (default: `false`) | If `true`, shows lock screen that cannot be dismissed |
| `platforms.windows-x86_64.url` | string | Yes | HTTPS download URL |
| `platforms.windows-x86_64.file_size` | u64 | No | Expected file size in bytes (0 = unknown) |
| `platforms.windows-x86_64.sha256` | string | No | SHA-256 hash (64 hex chars); verified if provided |
| `platforms.windows-x86_64.signature` | string | No | Minisign signature (for Tauri plugin compatibility; not verified by custom updater) |

---

## Security Model

| Protection | Implementation |
|------------|---------------|
| **HTTPS enforcement** | Manifest URL and download URL must use `https://` scheme (`updater.rs:248–253`) |
| **Manifest validation** | Version format, URL scheme, platform presence, file size sanity, SHA-256 format (`updater.rs:227–275`) |
| **SHA-256 integrity** | Computed over entire downloaded file, compared case-insensitively (`updater.rs:281–301`) |
| **PE header check** | First two bytes must be `MZ` — prevents executing non-executable files (`updater.rs:326–329`) |
| **File size validation** | Downloaded file must be ≥ 1 MB; exact match if manifest `file_size` > 0 (`updater.rs:311–323`) |
| **Downgrade prevention** | `is_version_newer()` ensures remote version > local version (`updater.rs:191–221`) |
| **`.part` file protection** | Download writes to `.part` suffix; only renamed after full verification (`updater.rs:584`) |
| **Concurrency lock** | `AtomicBool` prevents duplicate simultaneous downloads (`updater.rs:491–496`) |
| **Failed verification cleanup** | `.part` file deleted on any verification failure; error returned to frontend |
| **No sensitive data in logs** | Log contains only timestamps, version numbers, file sizes — no paths with user data |

---

## Signing

- The `signature` field in the manifest is populated for compatibility with Tauri's plugin updater ecosystem
- The custom updater does **not** verify minisign signatures — this is a documented limitation
- SHA-256 hash serves as the primary integrity verification mechanism
- If the `sha256` field is present in the manifest, the download will be cryptographically verified
- **Future improvement**: Ed25519 signature verification if needed for higher security requirements

---

## Auto Updates

- Setting: `auto_update` in `mvo-settings.json` (boolean, default: `true`)
- Frontend toggle: Settings page checkbox (`Settings.tsx:686`)
- Backend reads setting via `should_auto_check()` (`updater.rs:633–641`) before each background check
- If `auto_update` is `false`, background thread skips the periodic check (continues sleeping)
- **Manual checks always work** regardless of the `auto_update` setting
- Settings migration: `auto_update` is auto-added as `true` if missing from settings file (`lib.rs:3220`)

---

## Force Updates

- Set `force: true` in the manifest JSON
- Frontend receives `force: true` in `UpdateInfo` from `check_for_updates`
- `App.tsx:176` renders `UpdateLockScreen` which:
  - Covers entire screen with `z-[100]`
  - Uses `pointerEvents: 'all'` to block all interaction
  - No close button, no "Later" option
  - Automatically starts download on mount
  - On failure: shows Retry and Exit buttons
  - No infinite retry loops — user must explicitly click Retry or Exit

---

## Logging

- Location: `%LOCALAPPDATA%/MVO Hub/logs/updater.log`
- Format: `[YYYY-MM-DD HH:MM:SS.mmm] message`
- Events logged:
  - Check start
  - Current vs remote version
  - Update available/not available
  - Download start (URL truncated to 80 chars)
  - Verification status
  - Installer launch
  - Process completion
- No sensitive data (no API keys, no user file paths)

---

## Recovery

| Failure Scenario | Behavior |
|-----------------|----------|
| No internet connection | Check fails silently, error logged, app continues normally |
| GitHub unavailable | Same — silent failure |
| Invalid/corrupt JSON manifest | Error logged, app continues |
| Download interrupted | `.part` file cleaned up, current version remains intact |
| SHA-256 mismatch | File deleted, error shown to user |
| PE header check fails | File deleted, error shown to user |
| File too small | File deleted, error shown to user |
| NSIS installer fails | Error shown, user can retry via lock screen Retry button |
| Rollback | Previous exe backed up before NSIS install (keeps last 3 backups) |

---

## Release Process

1. Developer updates version in `Cargo.toml` and `tauri.conf.json`
2. Pushes version tag (e.g., `v0.2.13`)
3. GitHub Actions workflow builds the app + NSIS installer
4. SHA-256 hash calculated automatically during build
5. `latest.json` generated with hash + file size
6. Published to GitHub Release and committed to `main` branch
7. Existing installations detect the update within 6 hours (or immediately on next manual check)

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| No update notification | `auto_update` disabled or GitHub unreachable | Check Settings > Auto-update; check internet |
| Download fails repeatedly | Manifest hash incorrect or file corrupted at source | Verify `latest.json` hash matches release binary |
| "File too small" error | Incomplete download or incorrect manifest `file_size` | Re-download; verify manifest `file_size` field |
| Lock screen won't dismiss | `force: true` in manifest — this is intentional | Must update or click Exit |
| Update installs but doesn't restart | NSIS installer completed but app restart not triggered | Manually restart MVO Hub |
| `.part` file remains | Previous download was interrupted | Delete `%LOCALAPPDATA%/MVO Hub/*.part` manually |

---

## File Reference

| File | Lines of Interest |
|------|------------------|
| `src-tauri/src/updater.rs` | Full updater implementation (1279 lines) |
| `src-tauri/src/lib.rs` | Lines 15, 3220, 5317–5334 (background check), 5345–5405 (tray), 5605–5606 (command registration) |
| `src/hooks/useUpdater.ts` | Frontend hook (150 lines) |
| `src/components/UpdateModal.tsx` | Modal component (161 lines) |
| `src/components/UpdateLockScreen.tsx` | Lock screen component (177 lines) |
| `src/hooks/useSettings.ts` | `auto_update` setting (line 22, 57) |
| `src/pages/Settings.tsx` | Auto-update toggle (line 686) |
| `src/App.tsx` | Force check (line 176), modal render (line 256) |
| `latest.json` | Current manifest |
