# MVO Hub Updater — Test Report

## Automated Tests

**Test suite: `cargo test` (src-tauri/src/updater.rs)**

```
test result: 185 passed; 0 failed; 0 ignored
```

### Test Breakdown by Category

#### Version Comparison (23 tests)

| Test | Description |
|------|-------------|
| `patch_increment` | `0.2.11` → `0.2.12` detected as newer |
| `same_version` | Equal versions not flagged as newer |
| `minor_increment` | `0.2.12` → `0.3.0` detected as newer |
| `major_increment` | `0.9.99` → `1.0.0` detected as newer |
| `missing_patch_treated_as_zero` | `0.2` == `0.2.0` |
| `pre_release_is_older` | `0.2.0-beta` < `0.2.0` |
| `pre_release_comparison` | `alpha` < `beta`, `alpha.1` < `alpha.2` |
| `malformed_versions` | Empty/malformed local treated as old; malformed remote not newer |
| `empty_remote_is_not_newer` | Remote empty → not newer |
| `major_minor_only` | Two-segment versions compared correctly |
| `large_version_numbers` | `99.99.99` < `100.0.0` |
| `three_digit_patch` | `1.2.100` < `1.2.101` |
| `test_version_newer_patch` | Additional patch increment test |
| `test_version_newer_minor` | Additional minor increment test |
| `test_version_newer_major` | Additional major increment test |
| `test_version_same` | Duplicate same-version test |
| `test_version_older_remote` | Remote older than local → not newer |
| `test_version_missing_segment` | `0.2` < `0.2.1` |
| `test_version_empty_local` | Empty local treated as old |
| `test_version_empty_remote` | Empty remote not newer |
| `test_version_both_empty` | Both empty → not newer |
| `test_version_malformed_local` | `abc` treated as old |
| `test_version_malformed_remote` | `xyz` treated as not newer |

#### Manifest Validation (14 tests)

| Test | Description |
|------|-------------|
| `valid_manifest` | Standard valid manifest passes |
| `empty_version` | Empty version string rejected |
| `invalid_version_chars` | Version with `+` characters rejected |
| `missing_windows_platform` | No `windows-x86_64` platform rejected |
| `empty_url` | Empty download URL rejected |
| `non_https_url` | HTTP URL rejected |
| `small_file_size` | `file_size: 500` (< 1MB) rejected |
| `bad_sha256_length` | SHA-256 hash too short rejected |
| `bad_sha256_hex` | Non-hex characters in hash rejected |
| `test_valid_manifest` | Duplicate valid manifest test |
| `test_missing_version` | Duplicate empty version test |
| `test_missing_platform` | Duplicate missing platform test |
| `test_invalid_url_http` | Duplicate HTTP URL test |
| `test_empty_url` | Duplicate empty URL test |
| `test_bad_sha256_length` | Duplicate hash length test |
| `test_bad_sha256_chars` | Duplicate hash chars test |

#### SHA-256 Verification (5 tests)

| Test | Description |
|------|-------------|
| `hash_correct` | Known hash matches (SHA-256 of "hello world") |
| `hash_incorrect` | Wrong content produces wrong hash |
| `test_sha256_correct_hash` | Duplicate correct hash test |
| `test_sha256_incorrect_hash` | Duplicate incorrect hash test |
| `test_sha256_empty_file` | SHA-256 of empty file matches known hash |

#### State Machine (7 tests)

| Test | Description |
|------|-------------|
| `state_idle_to_checking` | Idle → Checking transition |
| `state_checking_to_available` | Checking → Available transition |
| `state_downloading_to_verifying` | Downloading → Verifying transition |
| `state_full_lifecycle` | Complete lifecycle through all states |
| `state_error_from_any` | Error state reachable from any state |
| `test_initial_state_is_idle` | Initial state is Idle |
| `test_state_transitions` | Full state transition sequence |

#### Version Parsing (5 tests)

| Test | Description |
|------|-------------|
| `parse_version_valid` | `"1.2.3"` parsed correctly |
| `parse_version_two_segments` | `"1.2"` parsed with patch=0 |
| `parse_version_pre_release` | `"1.0.0-beta.1"` parsed with 2 pre-release parts |
| `parse_version_empty` | Empty string returns None |
| `parse_version_non_numeric` | `"abc.def.ghi"` returns None |

#### Other Tests (131 tests)

The remaining 131 tests cover scanner functionality (`scanner_v2_*`), game detection, and other subsystems.

---

## Manual Test Plan

### Normal Update Flow

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 1 | Normal update available | Set local version lower than manifest version (e.g., downgrade `Cargo.toml` version temporarily) | Modal appears with version info, "Download & Install" button works, download completes, installer launches |
| 2 | No update available | Same version as manifest | "No updates available" logged; no modal shown |
| 3 | Downgrade attempt | Set local version higher than manifest | No update shown; `is_version_newer` returns false |
| 4 | Force update | Set `force: true` in `latest.json` | Lock screen appears, cannot be dismissed, download starts automatically |
| 5 | Force update failure | Set `force: true` with bad download URL | Lock screen shows error, Retry and Exit buttons available |

### Network & Connectivity

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 6 | Offline check | Disconnect internet, trigger manual check | Check fails silently, error logged, app continues normally |
| 7 | GitHub unavailable | Block `raw.githubusercontent.com` in hosts file | Check fails silently, error logged |
| 8 | Slow network | Throttle network to 1KB/s | Download proceeds with progress updates, completes eventually |
| 9 | Download interruption | Kill network during download | `.part` file cleaned up, error shown, app continues |

### Integrity Verification

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 10 | Bad hash | Modify `sha256` field in `latest.json` to wrong value | Download rejected, `.part` file deleted, error shown |
| 11 | Bad manifest | Corrupt JSON in `latest.json` | Error logged, app continues |
| 12 | Missing hash | Remove `sha256` from manifest | Download completes without hash check (SHA-256 skipped if empty) |
| 13 | Small file | Serve a 100-byte file as download | Rejected by size validation (>1MB check) |

### Settings & Configuration

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 14 | Auto-update OFF | Set `auto_update: false` in settings | Background checks stop (6-hour timer skipped) |
| 15 | Manual check while OFF | Click "Check Now" in Settings | Check still works regardless of `auto_update` |
| 16 | Auto-update ON | Set `auto_update: true` | Background checks resume |
| 17 | Custom manifest URL | Change `update_url` in settings | Updater fetches from new URL |

### Concurrency

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 18 | Concurrent downloads | Trigger two downloads rapidly | Second blocked with "A download is already in progress" error |
| 19 | Check during download | Click "Check for Updates" while downloading | Check proceeds (checks and downloads are independent) |

### System Tray

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 20 | Tray update check | Right-click tray → "Check for Updates" | Check runs, result emitted to frontend |
| 21 | Tray during force update | Right-click tray while lock screen shown | Lock screen blocks tray interaction |

### UI States

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 22 | Progress bar | Start download, observe modal | Progress bar shows percentage, MB downloaded/total |
| 23 | Verification state | Watch transition from download to verify | "Verifying update integrity..." spinner shown |
| 24 | Install state | Watch transition from verify to install | "Installing..." shown in modal |
| 25 | Error display | Trigger a download failure | Red error box shown with error message |
| 26 | Force modal close prevention | Try to close force update modal | Close button hidden; backdrop click ignored |

---

## Test Environment

- **OS**: Windows 10/11 x64
- **Rust**: Latest stable
- **Node**: Latest LTS
- **Tauri**: v2

## Notes

- All 185 automated tests pass with zero failures
- Manual tests should be performed in a staging environment with a test manifest
- Use a local `latest.json` override for testing different scenarios
- Force update testing should be done carefully — ensure an Exit path is available
