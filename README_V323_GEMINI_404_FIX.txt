Project MVO v3.2.3 Gemini 404 Fix

Replace only:
- src/App.tsx
- src/App.css
- src-tauri/src/lib.rs

Settings to use:
Provider: Google Gemini
Base URL: https://generativelanguage.googleapis.com/v1beta
Model: gemini-3.5-flash
API Key: your Gemini API key

This patch changes the Gemini default model to gemini-3.5-flash and uses the official x-goog-api-key header.
