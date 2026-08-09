# MVO Hub Updater — Full Technical Audit

**Audit Date**: August 8, 2026
**Auditor**: opencode (automated)
**Scope**: Complete custom updater subsystem

---

## Executive Summary

The MVO Hub updater is a well-structured custom implementation that replaces `tauri-plugin-updater` with a purpose-built system. The core security protections are solid: HTTPS enforcement, SHA-256 integrity verification, PE header validation, downgrade prevention, and concurrency locking. The version comparison logic handles pre-release tags correctly and the state machine covers all lifecycle transitions.

**What was found**:
- All 185 automated tests pass
- Security model is comprehensive for the threat model (man-in-the-middle, corrupted downloads, downgrade attacks)
- No critical vulnerabilities identified
- Several documented limitations and future improvements noted

**Key files examined**:
- `src-tauri/src/updater.rs` (1279 lines — core logic)
- `src-tauri/src/lib.rs` (5693 lines — integration, background check, tray)
- `src/hooks/useUpdater.ts` (150 lines — frontend state)
- `src/components/UpdateModal.tsx` (161 lines — modal UI)
- `src/components/UpdateLockScreen.tsx` (177 lines — force update UI)
- `src/hooks/useSettings.ts` (97 lines — settings)
- `src/pages/Settings.tsx` (auto_update toggle)
- `src/App.tsx` (271 lines — component integration)
- `src-tauri/Cargo.toml` (48 lines — dependencies)
- `src-tauri/tauri.conf.json` (53 lines — app config)
- `src-tauri/capabilities/default.json` (24 lines — permissions)
- `latest.json` (11 lines — manifest)

---

## Security Protections Active

### 1. HTTPS Enforcement
**File**: `updater.rs:248–253`
- Both manifest URL and download URL are validated to start with `https://`
- HTTP URLs are explicitly rejected with an error message
- Prevents man-in-the-middle attacks during manifest fetch and download

### 2. Manifest Validation
**File**: `updater.rs:227–275`
- Version string must be non-empty and contain only ASCII digits, dots, and hyphens
- `windows-x86_64` platform must be present
- Download URL must be non-empty and HTTPS
- File size must be ≥ 1 MB (if specified)
- SHA-256 hash must be 64 hex characters (if specified)
- Prevents malformed or malicious manifests from being processed

### 3. SHA-256 Integrity Verification
**File**: `updater.rs:281–301`
- Reads entire file in 8KB chunks, computing SHA-256 incrementally
- Comparison is case-insensitive hex
- Only verified if manifest provides a `sha256` field
- Prevents tampered downloads from being installed

### 4. PE Header Validation
**File**: `updater.rs:326–329`
- First two bytes of downloaded file must be `M` and `Z` (PE executable magic bytes)
- Prevents non-executable files (HTML error pages, ZIP archives, etc.) from being launched as installers

### 5. Size Validation
**File**: `updater.rs:311–323`
- Downloaded file must be ≥ 1 MB (1,048,576 bytes)
- If manifest specifies `file_size`, downloaded file must match exactly
- Prevents truncated or corrupted downloads

### 6. Downgrade Prevention
**File**: `updater.rs:191–221`
- `is_version_newer()` returns `true` only when remote version is strictly greater
- Pre-release versions correctly treated as older than release versions
- Malformed local version treated as "old" (allows update); malformed remote treated as "not newer"

### 7. `.part` File Protection
**File**: `updater.rs:549–584`
- Download writes to `MVO_Hub_{VERSION}_setup.exe.part`
- Only renamed to final name after all verification passes
- `.part` files are never executed
- Cleanup on any failure

### 8. Concurrency Lock
**File**: `updater.rs:491–496`
- `AtomicBool` prevents duplicate simultaneous downloads
- `compare_exchange` ensures only one download proceeds
- Second concurrent request returns error immediately

### 9. Rollback Backup
- Previous executable is backed up before NSIS installer runs
- Keeps last 3 backups to prevent disk space exhaustion

---

## Files Changed / Modified

| File | Purpose | Key Changes |
|------|---------|-------------|
| `src-tauri/src/updater.rs` | Core updater module | Created — all update logic, version comparison, manifest validation, download, verification, installer launch |
| `src-tauri/src/lib.rs` | App integration | Added `mod updater;` (line 15), background check thread (lines 5317–5334), tray menu "Check for Updates" (lines 5345–5405), command registration (lines 5605–5606), `auto_update` migration (line 3220) |
| `src/hooks/useUpdater.ts` | Frontend hook | Created — `useUpdater()` hook managing update state, check/install actions, progress events |
| `src/components/UpdateModal.tsx` | Update modal | Created — Non-force update dialog with version info, progress, release notes |
| `src/components/UpdateLockScreen.tsx` | Force update screen | Created — Full-screen overlay for mandatory updates, auto-starts download |
| `src/hooks/useSettings.ts` | Settings hook | Added `auto_update: boolean` field to `AppSettings` interface |
| `src/pages/Settings.tsx` | Settings UI | Added auto-update toggle checkbox |
| `src/App.tsx` | App entry | Integrated `useUpdater`, renders `UpdateLockScreen` for force updates, `UpdateModal` for optional updates |
| `latest.json` | Manifest | Created — Current version metadata for v0.2.12 |
| `src-tauri/Cargo.toml` | Dependencies | Added `sha2`, `hex`, `reqwest` (with stream feature), `futures-util`, `chrono` for updater |
| `src-tauri/tauri.conf.json` | App config | `createUpdaterArtifacts: true` for NSIS installer generation |

---

## Remaining Risks

### 1. Signature Verification Not Implemented
- **Risk**: Medium — minisign signatures in manifest are not verified
- **Detail**: The `signature` field exists for Tauri plugin compatibility but the custom updater does not validate it
- **Mitigation**: SHA-256 hash serves as the primary integrity check; requires manifest to be tamper-free
- **Recommendation**: Implement Ed25519 verification for higher assurance (see Future Improvements)

### 2. No Automatic Rollback if NSIS Installer Fails
- **Risk**: Low — NSIS installer failure is rare
- **Detail**: If the NSIS installer itself fails mid-install (e.g., disk full, permission denied), the app may be left in a broken state
- **Mitigation**: Current exe is backed up before install; manual reinstall from GitHub Releases is possible
- **Recommendation**: Post-install health check or NSIS error code monitoring

### 3. SHA-256 Only Verified If Hash Is Provided
- **Risk**: Low — manifest without hash allows installation without integrity check
- **Detail**: If `sha256` is empty in manifest, only PE header and size checks are performed
- **Mitigation**: Always include hash in manifest; this is a deployment process issue, not a code issue
- **Recommendation**: Add warning if manifest lacks hash; consider making hash required

### 4. Force Update Bypass via Process Kill
- **Risk**: Very Low — user choice
- **Detail**: A user can kill the MVO Hub process to bypass the force update lock screen
- **Mitigation**: This is intentional — force updates protect against running outdated code, not against determined users
- **Recommendation**: No action needed

### 5. Manifest URL Hardcoded Fallback
- **Risk**: Very Low
- **Detail**: Default manifest URL in `updater.rs:438` contains `YourOrg` placeholder; actual URL comes from settings
- **Mitigation**: Settings always provide the correct URL; fallback is only used if settings are missing
- **Recommendation**: Update fallback URL to match actual repository

### 6. Download Timeout May Be Insufficient for Large Files
- **Risk**: Low
- **Detail**: 300-second (5-minute) timeout for download; large installers on slow connections may fail
- **Mitigation**: Timeout is configurable at the HTTP client level; progress events allow frontend to show status
- **Recommendation**: Consider adaptive timeout based on file size

---

## Future Improvements

### 1. Ed25519 Signature Verification
- Add `ed25519-dalek` crate
- Verify minisign signature in manifest against a hardcoded public key
- Provides cryptographic proof of origin (not just integrity)
- Protects against manifest + binary substitution attacks

### 2. Differential Updates
- Implement binary diffing (e.g., `bsdiff` or `courgette`)
- Only download the delta between current and new version
- Reduces download size from ~80MB to ~5-10MB for minor updates
- Requires storing previous version info in manifest

### 3. Update Channel Selection
- Add `channel` field to manifest (stable, beta, nightly)
- Frontend setting to select preferred channel
- Allow beta testers to receive pre-release updates
- Nightly channel for development builds

### 4. Download Acceleration
- Implement multi-segment downloading (parallel range requests)
- Resume support for interrupted downloads (HTTP Range headers)
- Would improve experience on slow/unstable connections

### 5. Better NSIS Handoff
- Current: `cmd /C start "" "/WAIT" {path}` — spawns via cmd.exe
- Improvement: Direct process launch or use NSIS `/S` (silent) flag
- Could pass exit code back to frontend for success/failure detection
- Consider using `ShellExecuteW` with `runas` for UAC if needed

### 6. Update Rollback Detection
- After NSIS install, verify the new exe exists and is valid
- If verification fails, attempt to restore from backup
- Show user-friendly recovery message

### 7. Telemetry (Optional)
- Anonymous update check/install statistics
- Help identify update failure rates
- Must be opt-in and GDPR compliant

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      MVO Hub App                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐    ┌──────────────────────────────┐  │
│  │  React Frontend   │    │      Rust Backend             │  │
│  │                  │    │                                │  │
│  │  useUpdater()    │◄──►│  updater::check_for_updates() │  │
│  │    │             │    │    │                           │  │
│  │    ├─ checkFor   │    │    ├─ Fetch manifest           │  │
│  │    │  Updates()  │    │    ├─ Validate manifest        │  │
│  │    │             │    │    ├─ Compare versions         │  │
│  │    ├─ install    │    │    └─ Return result            │  │
│  │    │  Update()   │    │                                │  │
│  │    │             │    │  updater::download_and_        │  │
│  │    │             │    │      install_update()          │  │
│  │    │             │    │    │                           │  │
│  │    │             │    │    ├─ Fetch manifest           │  │
│  │    │             │    │    ├─ Download .part file      │  │
│  │    │             │    │    ├─ Verify SHA-256           │  │
│  │    │             │    │    ├─ Check PE header          │  │
│  │    │             │    │    ├─ Rename to final          │  │
│  │    │             │    │    └─ Launch NSIS installer    │  │
│  │    │             │    │                                │  │
│  │  ┌─┴────────┐   │    │  Background Thread             │  │
│  │  │ Update   │   │    │  (every 6 hours)               │  │
│  │  │ Modal    │   │    │    └─ check_for_updates()      │  │
│  │  └──────────┘   │    │        → emit result to FE     │  │
│  │  ┌─┴────────┐   │    │                                │  │
│  │  │ Lock     │   │    │  System Tray                    │  │
│  │  │ Screen   │   │    │    └─ "Check for Updates"      │  │
│  │  └──────────┘   │    │        → check_for_updates()   │  │
│  │                  │    │                                │  │
│  └──────────────────┘    └──────────────────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  External                                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  GitHub (raw.githubusercontent.com)                 │   │
│  │    └─ latest.json (manifest)                        │   │
│  │  GitHub Releases                                     │   │
│  │    └─ MVO.Hub_{VERSION}_x64-setup.exe              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Test Coverage Summary

| Category | Tests | Status |
|----------|-------|--------|
| Version comparison | 23 | All pass |
| Manifest validation | 14 | All pass |
| SHA-256 verification | 5 | All pass |
| State machine | 7 | All pass |
| Version parsing | 5 | All pass |
| Other (scanner, etc.) | 131 | All pass |
| **Total** | **185** | **All pass** |

---

## Conclusion

The MVO Hub updater is production-ready with a solid security foundation. The main area for improvement is adding cryptographic signature verification (Ed25519) to complement SHA-256 integrity checking. All documented limitations are acceptable for the current threat model and user base.

**Audit verdict**: PASS — no critical or high-severity issues found.
