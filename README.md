# MVO Hub

Universal Game Discovery Engine & System Optimizer

## Features

- **Dashboard** - System overview with CPU/RAM/GPU monitoring, recently launched games
- **Game Library** - Steam & custom game detection with cover art
- **Game Vault** - Download free games
- **Files** - Quick folder access
- **Tools** - External tool detection
- **Settings** - Account, updates, themes, advanced Windows tools

## Auto Updates

The app checks for updates on startup via GitHub Releases. When an update is available, the app locks until the user installs it.

## Building

```bash
# Install dependencies
npm install

# Development
npm run tauri dev

# Production build (with updater signing)
build-release.bat
```

## Update Process

1. Bump version in `tauri.conf.json`
2. Run `build-release.bat` (sets signing key automatically)
3. Create GitHub release with the `.exe`, `.sig`, and `latest.json` files
4. Users receive the update on next app launch
