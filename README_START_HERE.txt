PROJECT MVO v3.1.7 WHITE SCREEN HARD RESET

This package has the files in the correct locations:
- src/App.tsx = React UI/layout
- src/App.css = React UI styles
- src/main.tsx = React startup + white-screen guard
- src-tauri/src/lib.rs = Rust backend commands

IMPORTANT:
Do not put App.tsx inside src-tauri/src. That folder is only for Rust files.

HOW TO RUN:
1. Open PowerShell inside this project folder.
2. Run:
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
   .\RUN_PROJECT_MVO_DEV.ps1

If PowerShell still blocks the script, run:
   powershell -NoProfile -ExecutionPolicy Bypass -File ".\RUN_PROJECT_MVO_DEV.ps1"

WHAT WAS FIXED:
- Root index.html now has a dark fallback screen. If React fails, it should not go plain white.
- src/main.tsx now has React ErrorBoundary and global startup error guard.
- App.tsx has localStorage sanity checks.
- AI Generate can use OPENAI_API_KEY from PowerShell even if API key box is empty.
- Scroll and bottom HUD fixes are kept.
- Function Test Center expansion is kept.

If you still see a plain white screen, you are probably running old files, or App.tsx/main.tsx is not inside the src folder.
