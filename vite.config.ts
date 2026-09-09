import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  optimizeDeps: {
    // PGlite ships a wasm bundle that must not be pre-bundled by esbuild.
    exclude: ['@electric-sql/pglite'],
  },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2400 },
})
