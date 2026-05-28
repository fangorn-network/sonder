import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['dbus-next']
      }
    }
  },
  preload: {},
  renderer: {
      build: {
        rollupOptions: {
          onwarn(warning, warn) {
            if (warning.code === 'UNRESOLVED_IMPORT') return
            warn(warning)
          },
          external: (id) => id.includes('__vite-optional-peer-dep')
        }
      },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    server: {
      proxy: {
        '/search': 'http://localhost:8080',
        '/health': 'http://localhost:8080',
        '/reingest': 'http://localhost:8080',
        '/facilitator': {
          target: 'https://facilitator.fangorn.network',
          changeOrigin: true,
          secure: false,
          followRedirects: true,
          rewrite: (path: any) => path.replace(/^\/facilitator/, ''),
          configure: (proxy: any) => {
            proxy.on('proxyReq', (_proxyReq, req) => {
              console.log('proxying:', req.method, req.url)
            })
          }
        }
      }
    }
  }
})