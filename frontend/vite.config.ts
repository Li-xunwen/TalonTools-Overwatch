import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
    resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
   server: {
    host: '0.0.0.0',   // 默认是 'localhost'
    port: 80,        // 默认是 5173
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // rewrite: (path) => path, // 不需要重写，直接转发 /api/xxx
      },
    },
  },
})
