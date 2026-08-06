Project MVO v3.1 Real App Foundation

Replace these files/folders:
- package.json
- src/App.tsx
- src/App.css
- src-tauri/Cargo.toml
- src-tauri/src/lib.rs

Keep your existing package-lock.json and Cargo.lock if you already ran npm install/cargo add successfully.

What changed:
- Settings now has AI API connection fields.
- API key is stored locally in browser localStorage on your PC.
- Test API Connection calls the Rust backend to avoid browser/CORS issues.
- AI Tools uses the API when configured, otherwise uses local fallback.
- Tools page has searchable Function Test Center with pass/fail result output.
- Missing-public-release checklist added in Tools.
- Scroll behavior reinforced through CSS.

Run:
npm install
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
