Project MVO v3.0 Stable Shell + Profile System

Replace these files/folders in your Project MVO project:

index.html
package.json
package-lock.json
tsconfig.json
tsconfig.node.json
vite.config.ts

src/App.tsx
src/App.css
src/main.tsx
src/vite-env.d.ts

src-tauri/Cargo.toml
src-tauri/tauri.conf.json
src-tauri/build.rs
src-tauri/src/lib.rs
src-tauri/src/main.rs
src-tauri/capabilities/default.json

Run:

taskkill /F /IM project-mvo-app.exe
taskkill /F /IM node.exe

cd "$env:USERPROFILE\Documents\Project-MVO\project-mvo-app"
npm install
npm run tauri dev

Important:
- This version uses a locked 1920x1080 cinematic canvas.
- Tools > Fit Canvas keeps layout shape when resized.
- Tools > Scroll Lock keeps 100% canvas and scrolls.
- Top-right buttons use Rust commands: minimize, maximize/restore, close.
- Boot logo runs for 3 seconds with WebAudio synthetic boot tone. If Windows/WebView blocks audio on first launch, animation still runs.
