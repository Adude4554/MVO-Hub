Project MVO v3.2.2 Gemini AI Patch

Replace only:
- src/App.tsx
- src/App.css
- src-tauri/src/lib.rs

What it adds:
- Google Gemini provider in Settings
- Gemini defaults:
  Base URL: https://generativelanguage.googleapis.com/v1beta
  Model: gemini-2.5-flash-lite
- Supports API key box OR PowerShell environment variables:
  GEMINI_API_KEY
  GOOGLE_API_KEY
- Keeps OpenAI-compatible support if you switch back.
- Keeps in-app scroll fix.

Run:
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
