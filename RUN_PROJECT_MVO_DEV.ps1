$ErrorActionPreference = "Stop"

Write-Host "Project MVO v3.1.7 hard reset run" -ForegroundColor Cyan
Write-Host "Stopping old Project MVO dev processes..." -ForegroundColor Cyan
Get-Process project-mvo-app,node,cargo,rustc -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Clearing stale frontend caches..." -ForegroundColor Cyan
Remove-Item ".\dist" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item ".\node_modules\.vite" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item ".\src-tauri\target\.rustc_info.json" -Force -ErrorAction SilentlyContinue

Write-Host "Clearing old Tauri/WebView cache folders if present..." -ForegroundColor Cyan
$possibleCacheFolders = @(
  "$env:LOCALAPPDATA\com.projectmvo.app",
  "$env:LOCALAPPDATA\Project MVO",
  "$env:LOCALAPPDATA\ProjectMVO",
  "$env:APPDATA\com.projectmvo.app"
)
foreach ($folder in $possibleCacheFolders) {
  if (Test-Path $folder) {
    Write-Host "Removing cache: $folder" -ForegroundColor DarkCyan
    Remove-Item $folder -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Using public npm registry..." -ForegroundColor Cyan
npm config set registry https://registry.npmjs.org/

Write-Host "Installing npm packages..." -ForegroundColor Cyan
npm install

Write-Host "Checking frontend build..." -ForegroundColor Cyan
npm run build

Write-Host "Checking Rust backend..." -ForegroundColor Cyan
cargo check --manifest-path src-tauri/Cargo.toml

Write-Host "Starting Project MVO..." -ForegroundColor Green
npm run tauri dev
