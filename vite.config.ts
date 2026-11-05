import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Dedicated mode for the Playwright smoke suite: boots straight into the
  // app shell (no splash/auth) and allows `?page=<id>` deep links.
  const testHarness = mode === 'test'

  return {
    define: testHarness
      ? { 'import.meta.env.VITE_TEST_HARNESS': JSON.stringify('1') }
      : {},
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    publicDir: 'public',
    build: {
      target: 'es2021',
      minify: 'esbuild',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            tauri: ['@tauri-apps/api'],
            ui: ['lucide-react'],
          },
        },
      },
    },
    server: {
      // Port 1420 is reserved for `tauri dev`; tests use 1421 so they can run
      // alongside a live dev session.
      // Bind IPv4 explicitly: on Windows `localhost` resolves to ::1, which
      // Playwright's 127.0.0.1 readiness probe would never reach.
      host: testHarness ? '127.0.0.1' : undefined,
      port: testHarness ? 1421 : 1420,
      strictPort: true,
      watch: {
        usePolling: true,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/src-tauri/**',
          '**/dist/**',
        ],
      },
    },
    envPrefix: ['VITE_', 'TAURI_'],
  }
})
