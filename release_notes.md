## v0.2.11 — Updater Fix

### Fixed: Updater Always Showing "Update Available"
Root cause: `Cargo.toml` version was `0.1.0` while `tauri.conf.json` was `0.2.x`. The Rust `check_for_updates` command uses `env!("CARGO_PKG_VERSION")` which reads from Cargo.toml, so it always thought `0.2.x` was newer than `0.1.0`.

Fix: Updated `Cargo.toml` version to match `0.2.11`.

### Fixed: "0" Rendering in Settings
React renders `{0 && <Component />}` as the number `0` on screen. Changed condition to `{file_size != null && file_size > 0}`.
