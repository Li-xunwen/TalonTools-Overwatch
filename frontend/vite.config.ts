import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
dotenv.config()
const apiProxyTarget = process.env.API_PROXY_TARGET;

const cert = fs.readFileSync('/ssl/cert.pem', 'utf8');
const key = fs.readFileSync('/ssl/cert.key', 'utf8');

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 8443,
    https: {
      cert,
      key
    },
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
