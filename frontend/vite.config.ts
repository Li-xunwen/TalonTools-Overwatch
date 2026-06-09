import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config()

// 从环境变量读取配置，提供默认值
const apiProxyTarget = process.env.API_PROXY_TARGET
const serverPort = parseInt(process.env.VITE_SERVER_PORT || '5173', 10)
const enableHttps = process.env.VITE_ENABLE_HTTPS === 'true'
const sslKeyPath = process.env.SSL_KEY_PATH
const sslCertPath = process.env.SSL_CERT_PATH

// 构建 HTTPS 配置（仅在启用且提供了有效路径时）
let httpsConfig = undefined
if (enableHttps && sslKeyPath && sslCertPath) {
  try {
    httpsConfig = {
      key: fs.readFileSync(sslKeyPath, 'utf8'),
      cert: fs.readFileSync(sslCertPath, 'utf8'),
    }
  } catch (err) {
    console.warn('读取 SSL 证书文件失败，将使用 HTTP:', err)
    httpsConfig = undefined
  }
} else if (enableHttps) {
  console.warn('已设置 VITE_ENABLE_HTTPS=true 但未提供 SSL_KEY_PATH 或 SSL_CERT_PATH，将使用 HTTP')
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: serverPort,
    // 如果有 HTTPS 配置则启用，否则为 HTTP
    https: httpsConfig,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
