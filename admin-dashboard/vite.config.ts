import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5000,
    host: '0.0.0.0', // Allow external connections in Docker
    strictPort: true,
    allowedHosts: true, // Allow any host header (needed in Docker)
    proxy: {
      '/api': {
        target: 'http://mdm-backend:5001', // Use Docker service name
        changeOrigin: true,
        secure: false
      },
      '/health': {
        target: 'http://mdm-backend:5001', // Use Docker service name
        changeOrigin: true,
        secure: false
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