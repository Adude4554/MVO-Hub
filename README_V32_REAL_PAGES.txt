Project MVO v3.2 Real Pages Build

This build focuses on making each sidebar page a real module instead of repeating the same generic buttons.

Included:
- Unique Game Library page with search/filter/manual EXE picker.
- Unique Game Mode page with power-plan sequence and profile selector.
- Unique Optimizer page with safe optimizer checklist.
- Unique Performance page with live CPU/RAM/Storage graph and telemetry cards.
- Unique System Boost page.
- Unique AI page with API debug/status and exact backend errors.
- Unique Overlay page for FPS Monitor.
- Unique Streaming Studio page with scene controls and audio mixer.
- Unique Files/Web/Tools/Settings pages.
- API Generate always calls Rust backend when Base URL + Model are filled.
- Local fallback only after backend API returns an error.
- White-screen guard remains in src/main.tsx.

Run:
1. npm install
2. npm run build
3. cargo check --manifest-path src-tauri/Cargo.toml
4. npm run tauri dev

API:
- Base URL: https://api.openai.com/v1
- Model: gpt-4o-mini
- Paste key in Settings OR start from PowerShell with OPENAI_API_KEY.
- Do not keep API keys in APIKEY.txt or inside the project folder.
