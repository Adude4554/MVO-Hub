import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
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
          vendor: ['react', 'react-dom', 'zustand'],
          tauri: ['@tauri-apps/api'],
          ui: ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      usePolling: true,
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
})