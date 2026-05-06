import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  optimizeDeps: {
    exclude: ['music-metadata'],
  },
  server: {
    proxy: {
      '/search': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
      '/reingest': 'http://localhost:8080',
      '/facilitator': {
        target: 'https:/facilitator.fangorn.network',
        changeOrigin: true,
        secure: false,
        followRedirects: true,
        rewrite: path => path.replace(/^\/facilitator/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, req) => {
            console.log('proxying:', req.method, req.url)
          })
        }
      }
    },
    host: true,
    port: 5173,
    watch: {
      usePolling: true
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