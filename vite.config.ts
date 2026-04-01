import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  optimizeDeps: {
    exclude: ['music-metadata'],
  },
  build: {
    rollupOptions: {
      external: ['node:fs', 'node:path', 'node:stream', 'node:buffer'],
    }
  },
  plugins: [
    nodePolyfills(),
    react(),
  ],
})