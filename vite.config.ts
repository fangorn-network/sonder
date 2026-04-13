import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  optimizeDeps: {
    exclude: ['music-metadata'],
  },
  server: {
    proxy: {
      '/facilitator': {
        target: 'http://localhost:30333 ',
        changeOrigin: true,
        secure: false,
        rewrite: path => path.replace(/^\/facilitator/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('proxying:', req.method, req.url)
          })
        }
      }
    }
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