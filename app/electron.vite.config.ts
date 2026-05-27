import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@electron-toolkit/utils',
          'mime-types',
          'dotenv',
          'mime',
          "@fangorn-network/sdk*",
          "@fangorn-network/fetch*"
        ]
      })
    ]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
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