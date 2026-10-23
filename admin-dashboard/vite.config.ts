import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Compiled from source, so the CommonJS build of the package never reaches Vite.
      '@mdm/shared-types': path.resolve(__dirname, '../integration/shared-types/src/index.ts')
    }
  },
  server: {
    port: 5002,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5001', // Use Docker service name
        changeOrigin: true,
        secure: false,
        timeout: 300000,
        proxyTimeout: 300000
      },
      '/health': {
        target: 'http://localhost:5001', // Use Docker service name
        changeOrigin: true,
        secure: false
      },
      // Live updates and signed APK downloads also go through this port, so a browser
      // only ever needs :5002 and the dashboard works under any hostname.
      '/socket.io': {
        target: 'http://localhost:5001',
        ws: true,
        changeOrigin: true
      },
      '/downloads': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        timeout: 300000,
        proxyTimeout: 300000
      }
    }
  },
  preview: {
    port: 5000,
    host: '0.0.0.0'
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})