## Bug Fixes & Improvements

### Fixed: Black Screen on Launch
- Moved ToastProvider to root level in main.tsx
- Fixed temporal dead zone in App.tsx
- Added ErrorBoundary to catch and display React crashes

### Fixed: GameVault Store Not Loading
- Fixed GameVault URL (was 404, now works)

### Fixed: Updater
- Updates page reads actual version from backend
- Auto-checks for updates on mount
- Shows latest version message when up to date
- Toast notifications on update check result
