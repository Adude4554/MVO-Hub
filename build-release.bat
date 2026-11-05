@echo off
REM ============================================================
REM  MVO Hub - local release build
REM
REM  Signing credentials are NEVER stored in this repository.
REM  Set them in your environment before running this script:
REM
REM    set TAURI_SIGNING_PRIVATE_KEY=<base64 minisign key>
REM    set TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<key password>
REM
REM  Generate a NEW keypair (the old one was committed to git
REM  history and must be considered compromised):
REM    npx tauri signer generate
REM
REM  The manifest Ed25519 key (MANIFEST_SIGNING_KEY) is only
REM  needed by the CI release workflow, not for local builds.
REM ============================================================

if "%TAURI_SIGNING_PRIVATE_KEY%"=="" (
  echo ERROR: TAURI_SIGNING_PRIVATE_KEY is not set.
  echo        Generate a keypair with: npx tauri signer generate
  echo        Then set it as an environment variable or GitHub Secret.
  exit /b 1
)

cd /d "%~dp0"
npm run tauri build
