import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

// The Playwright smoke suite runs the web build in a browser, where Tauri's
// IPC bridge is absent. A static import (not dynamic) guarantees the double is
// evaluated before any application module that talks to Tauri.
// Production builds tree-shake this away (`VITE_TEST_HARNESS` is undefined).
if (import.meta.env.VITE_TEST_HARNESS === '1') {
  const mod = await import('./test-harness/tauri-stub')
  void mod
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
