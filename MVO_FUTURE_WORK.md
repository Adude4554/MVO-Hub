# MVO Hub — Future Work Roadmap

**Last Updated:** August 9, 2026  
**Current Version:** 0.2.12  
**Test Status:** 185 tests passing, 0 warnings, 0 errors

---

## Current State Summary

### What Exists

| System | Files | Status |
|--------|-------|--------|
| **Game Scanner V2** | 31 modules (16 launchers + infrastructure) | Production-ready |
| **Hardware Monitoring** | NVIDIA (full), Intel/AMD (basic), CPU, RAM, Battery, Storage | Production-ready |
| **Updater System** | SHA-256, state machine, logging, rollback, CI/CD | Production-ready |
| **Settings & Cloud Sync** | Persistent settings, gist-based sync, conflict detection | Production-ready |
| **System Tray** | Quick scan, check updates, show window | Production-ready |
| **Frontend Pages** | 22 pages total | Core pages complete, extras untested |
| **CI/CD** | Build + release workflows with auto-manifest | Production-ready |

### What's Verified

```
✅ 185 Rust tests passing
✅ 0 TypeScript errors
✅ 0 Rust warnings
✅ Frontend builds clean (2.3s)
✅ NSIS/MSI bundle config
✅ GitHub Actions release pipeline
```

---

## Tier 1 — Required Before v0.2.13 Release

### 1.1 Build & Test Production Installer

**Priority:** Critical  
**Effort:** Medium

- [ ] Run `cargo tauri build` to produce NSIS installer
- [ ] Test installer on clean Windows 10/11 machine
- [ ] Verify silent install (`/S` flag) works
- [ ] Verify UAC elevation behavior
- [ ] Test update flow (0.2.12 → 0.2.13)
- [ ] Test force update flow
- [ ] Test offline behavior
- [ ] Test corrupted download rejection

### 1.2 Version Bump

**Priority:** Critical  
**Effort:** Low

Update version to `0.2.13` in all sources:
- [ ] `package.json` → `"version": "0.2.13"`
- [ ] `src-tauri/Cargo.toml` → `version = "0.2.13"`
- [ ] `src-tauri/tauri.conf.json` → `"version": "0.2.13"`
- [ ] Git tag: `v0.2.13`

### 1.3 README.md

**Priority:** High  
**Effort:** Low

Create a user-facing README with:
- [ ] Project description
- [ ] Screenshots
- [ ] Installation instructions
- [ ] System requirements
- [ ] Features overview
- [ ] Building from source
- [ ] Contributing guidelines
- [ ] License

### 1.4 Extra Pages Audit

**Priority:** High  
**Effort:** Medium

These 16 pages exist but are untested:

| Page | Purpose | Priority |
|------|---------|----------|
| `Browser.tsx` | In-app web browser | Medium |
| `GameVault.tsx` | Game store/library/downloads | High |
| `MoviesTV.tsx` | Movie/TV show streaming | Medium |
| `GlobalChat.tsx` | Chat system | Low |
| `AITools.tsx` | AI integration | Medium |
| `Overlay.tsx` | In-game overlay | Medium |
| `Streaming.tsx` | Game streaming | Low |
| `Optimizer.tsx` | System optimizer | Medium |
| `SystemBoost.tsx` | Performance boost | Medium |
| `GameMode.tsx` | Game mode profiles | Medium |
| `Tools.tsx` | External tools | Low |
| `WebHub.tsx` | Web shortcuts | Low |
| `Files.tsx` | File manager | Low |
| `FunctionTest.tsx` | Dev testing | Low |
| `PageTemplate.tsx` | Template | Low |

**Action:** Test each page, fix runtime errors, remove dead code.

---

## Tier 2 — v0.2.14 Improvements

### 2.1 Hardware Monitoring Enhancements

**Priority:** Medium  
**Effort:** Medium

| Component | Current | Target |
|-----------|---------|--------|
| Intel GPU | Usage + VRAM | + Temperature, Clock Speed |
| AMD GPU | Usage + VRAM | + Temperature, Fan Speed, Power, Clock |
| Motherboard | BIOS + Boot Time | + Temperatures (via HWiNFO/WMI) |
| Network | Basic | + Bandwidth, Latency |
| Storage | Basic | + SMART health, Temperature |

**Approach:** Use OpenHardwareMonitor WMI or direct WMI queries for additional sensors.

### 2.2 NSIS Handoff Improvement

**Priority:** Medium  
**Effort:** Medium

Current: `cmd /C start "" /WAIT setup.exe`  
Target: Proper NSIS `nsExec::ExecToStack` or custom bootstrapper

Issues with current approach:
- No guaranteed wait for MVO exit
- Edge cases with UAC prompts
- No progress feedback during handoff

**Solution:** Small Rust helper binary or NSIS `InitPluginsDir` with wait loop.

### 2.3 Ed25519 Signature Verification

**Priority:** Medium  
**Effort:** Medium

Currently SHA-256 only. Add minisign/ed25519 verification:
- Add `ed25519-dalek` dependency
- Embed public key in binary
- Verify `signature` field from manifest
- Update release pipeline to sign with minisign

### 2.4 Differential Updates

**Priority:** Low  
**Effort:** High

Instead of downloading full installer each time:
- Generate binary diff between versions
- Download only the diff
- Apply patch locally
- Reduces download size by 60-80%

**Libraries:** `bsdiff` or `xdelta`

### 2.5 Update Channels

**Priority:** Low  
**Effort:** Medium

Allow users to choose:
- `stable` — Only stable releases
- `beta` — Include beta/RC releases
- `nightly` — Latest builds

**Implementation:** Separate manifests per channel (`latest.json`, `latest-beta.json`, `latest-nightly.json`).

---

## Tier 3 — v0.3.0+ Features

### 3.1 Cross-Platform Support

**Priority:** Low  
**Effort:** Very High

| Platform | Status | Effort |
|----------|--------|--------|
| Windows | Complete | — |
| Linux | Not started | High |
| macOS | Not started | Very High |

**Changes needed:**
- Replace WMI queries with platform-specific alternatives
- Replace `sysinfo` Windows-specific code
- Add Linux launcher detection (Lutris native, Steam Flatpak)
- Add macOS launcher detection (Steam, CrossOver)
- CI/CD for Linux/macOS builds

### 3.2 Plugin System

**Priority:** Low  
**Effort:** High

Allow third-party launcher scanners:
- Define scanner trait/API
- Load dynamic libraries (.dll/.so)
- Registry of community plugins
- Sandboxed execution

### 3.3 Game Achievements & Statistics

**Priority:** Low  
**Effort:** High

- Track playtime per game (already have launch tracker)
- Achievement tracking via Steam/Epic APIs
- Gaming statistics dashboard
- Weekly/monthly reports
- Social features (compare with friends)

### 3.4 Cloud Saves

**Priority:** Low  
**Effort:** High

- Detect game save locations
- Sync saves to cloud (Google Drive, OneDrive, custom)
- Conflict resolution for saves
- Cross-device play support

### 3.5 Multi-Language Support

**Priority:** Low  
**Effort:** Medium

Currently hardcoded English. Add i18n:
- Extract all strings to locale files
- Support English, Spanish, French, German, Japanese, Chinese
- RTL support for Arabic/Hebrew
- Community translation system

### 3.6 Game Modding Support

**Priority:** Low  
**Effort:** High

- Mod manager integration
- Mod download/install
- Load order management
- Compatibility checking

### 3.7 Social Features

**Priority:** Low  
**Effort:** High

- Friend list
- Activity feed
- Game recommendations
- Party system
- Voice chat integration

---

## Technical Debt

### Known Issues

| Issue | Severity | File | Description |
|-------|----------|------|-------------|
| 16 extra pages untested | Medium | `src/pages/*.tsx` | Runtime errors may exist |
| Intel/AMD GPU sensors basic | Low | `hardware/gpu/intel.rs`, `amd.rs` | Only usage + VRAM |
| Motherboard sensors static | Low | `hardware/motherboard/provider.rs` | No dynamic temps |
| NSIS handoff edge cases | Low | `updater.rs` | cmd /C start approach |
| No signature verification | Low | `updater.rs` | SHA-256 only |
| TMDB API key fallback | Low | `lib.rs` | Hardcoded fallback key |
| GlobalChat untested | Low | `GlobalChat.tsx` | May not work |
| Streaming untested | Low | `Streaming.tsx` | May not work |

### Code Quality

| Area | Status |
|------|--------|
| Rust warnings | 0 |
| TypeScript errors | 0 |
| Test coverage | 185 tests |
| Dead code | Minimal |
| Documentation | Complete for updater |

---

## Release Checklist

### v0.2.13 Release

- [ ] Build production installer
- [ ] Test on clean Windows machine
- [ ] Version bump (all 3 files)
- [ ] Write README.md
- [ ] Test extra pages
- [ ] Fix any runtime errors
- [ ] Tag v0.2.13
- [ ] Push to GitHub
- [ ] Verify release workflow runs
- [ ] Verify latest.json generated
- [ ] Test auto-update from 0.2.12

### v0.2.14 Release

- [ ] Intel/AMD GPU sensor improvements
- [ ] NSIS handoff improvement
- [ ] Ed25519 signature verification
- [ ] Extra pages fully tested
- [ ] Performance optimizations

### v0.3.0 Release

- [ ] Cross-platform support (Linux)
- [ ] Plugin system
- [ ] Multi-language support
- [ ] Game achievements
- [ ] Cloud saves

---

## Dependencies to Add (Future)

| Crate | Purpose | When |
|-------|---------|------|
| `ed25519-dalek` | Signature verification | v0.2.14 |
| `bsdiff` | Differential updates | v0.3.0 |
| `notify` | File watching for mods | v0.3.0 |
| `rodio` | Audio for notifications | v0.3.0 |
| `tracing` | Structured logging | v0.3.0 |

---

## Architecture Decisions

### Keep Custom Updater

The custom updater will remain. `tauri-plugin-updater` is not used because:
1. Full control over SHA-256 verification
2. Custom state machine
3. Proper logging
4. Rollback mechanism
5. Concurrency protection

### Keep WMI for Hardware

WMI will remain the primary hardware interface because:
1. No external dependencies (HWiNFO, OpenHardwareMonitor)
2. Works on all Windows versions
3. Already integrated
4. Sufficient for most users

### Keep GitHub Releases

GitHub Releases will remain the distribution channel because:
1. Free hosting
2. CDN-backed
3. Version management built-in
4. CI/CD integration
5. Community access

---

## Success Metrics

### v0.2.13

- [ ] Installer builds successfully
- [ ] Silent install works
- [ ] Auto-update works end-to-end
- [ ] 185+ tests passing
- [ ] README complete
- [ ] No critical bugs

### v0.2.14

- [ ] GPU temperature/fan readings
- [ ] Signature verification working
- [ ] All 22 pages tested
- [ ] < 5 known bugs

### v0.3.0

- [ ] Linux build available
- [ ] Plugin system documented
- [ ] 3+ languages supported
- [ ] < 3 known bugs
