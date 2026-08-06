$ErrorActionPreference = "Continue"

Write-Host "Project MVO reset + run" -ForegroundColor Cyan
Write-Host "Stopping old Project MVO dev processes..." -ForegroundColor Cyan
Get-Process project-mvo-app,node,cargo,rustc -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Clearing frontend output/cache..." -ForegroundColor Cyan
Remove-Item ".\dist" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item ".\node_modules\.vite" -Recurse -Force -ErrorAction SilentlyContinue

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

Write-Host "Building frontend..." -ForegroundColor Cyan
npm run build

Write-Host "Starting Project MVO dev mode..." -ForegroundColor Green
npm run tauri dev
