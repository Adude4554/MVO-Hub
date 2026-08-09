<p align="center">
  <img src="src-tauri/icons/icon.ico" alt="MVO Hub Logo" width="100" height="100">
</p>

<h1 align="center">MVO Hub</h1>

<p align="center">
  <strong>Your all-in-one gaming dashboard for Windows</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.2.13-blue" alt="Version 0.2.13">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11%20(64--bit)-0078d4" alt="Platform">
</p>

---

## Features

- **Game Scanner V2** — Auto-discovers games across 16+ launchers (Steam, Epic, GOG, EA, Ubisoft, Battle.net, Riot, Xbox, Amazon, itch.io, Rockstar, Minecraft, Lutris, Heroic, Emulator, Standalone)
- **Hardware Monitoring** — Real-time CPU, GPU (NVIDIA/Intel/AMD), RAM, temperature, fan speed, power usage
- **Smart Updates** — Secure auto-updater with SHA-256 verification, background checks, force updates
- **Settings & Cloud Sync** — Persistent settings with GitHub Gist cloud backup
- **System Tray** — Quick scan and update check from the tray
- **Game Launch Tracking** — Track playtime and active sessions
- **Performance Profiles** — Per-game CPU affinity, priority, and power settings
- **Metadata Enrichment** — Fetch game info from Steam Store API

---

## Screenshots

### Dashboard
<!-- ![Dashboard](screenshots/dashboard.png) -->

### Game Scanner
<!-- ![Scanner](screenshots/scanner.png) -->

### Hardware Monitoring
<!-- ![Hardware](screenshots/hardware.png) -->

### Settings
<!-- ![Settings](screenshots/settings.png) -->

---

## Installation

### Download

Download the latest release from [GitHub Releases](https://github.com/Adude4554/MVO-Hub/releases).

Available installers:
- **NSIS Installer** (`.exe`) — Recommended for most users
- **MSI Installer** (`.msi`) — For enterprise or silent installs

### System Requirements

| Requirement | Minimum |
|-------------|---------|
| OS | Windows 10/11 (64-bit) |
| RAM | 4 GB |
| Disk Space | 500 MB |
| Internet | Required for updates and metadata |

### Install Instructions

1. Download the installer from [GitHub Releases](https://github.com/Adude4554/MVO-Hub/releases)
2. Run the NSIS installer (`.exe`) or MSI installer
3. Follow the setup wizard
4. Launch MVO Hub

---

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) stable
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/)

### Steps

```bash
# Clone the repository
git clone https://github.com/Adude4554/MVO-Hub.git
cd MVO-Hub

# Install dependencies
npm ci

# Development
npm run tauri:dev

# Production build
npm run tauri:build
```

---

## Development

### Project Structure

```
MVO-Hub/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── pages/              # Page components (22 pages)
│   ├── hooks/              # React hooks
│   └── lib/                # Utilities
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Main Tauri commands
│   │   ├── updater.rs      # Hardened updater system
│   │   ├── scanner/        # Game scanner (31 modules)
│   │   ├── hardware/       # Hardware monitoring
│   │   └── gamevault/      # Database layer
│   └── Cargo.toml
├── .github/workflows/      # CI/CD
└── package.json
```

### Running Tests

```bash
# Rust tests
cd src-tauri && cargo test

# Frontend build
npm run build
```

---

## Updating

MVO Hub checks for updates automatically every 6 hours. You can also check manually:

- **Settings** → **Updates** → **Check Now**
- **System Tray** → **Check for Updates**

Updates are verified with SHA-256 integrity checks before installation.

### Update Process (Maintainers)

1. Bump version in `src-tauri/tauri.conf.json` and `package.json`
2. Run `npm run tauri:build` (sets signing key automatically)
3. Create a GitHub release with the `.exe`, `.sig`, and `latest.json` files
4. Users receive the update on next app launch

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`cd src-tauri && cargo test`)
5. Submit a pull request

---

## License

[MIT](LICENSE)

---

## Support

- **GitHub Issues:** https://github.com/Adude4554/MVO-Hub/issues
- **GitHub Discussions:** https://github.com/Adude4554/MVO-Hub/discussions
