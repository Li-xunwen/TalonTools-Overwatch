import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config()

const apiProxyTarget = process.env.API_PROXY_TARGET
const serverPort = parseInt(process.env.VITE_SERVER_PORT || '5173', 10)
const enableHttps = process.env.VITE_ENABLE_HTTPS === 'true'
const sslKeyPath = process.env.SSL_KEY_PATH
const sslCertPath = process.env.SSL_CERT_PATH

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
    https: httpsConfig,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        // 修正 configure 函数的写法
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // 从原始请求中取出真实 IP 头，传递给后端
            if (req.headers['x-real-ip']) {
              proxyReq.setHeader('X-Real-IP', req.headers['x-real-ip'])
            }
            // 转发 X-Forwarded-For
            if (req.headers['x-forwarded-for']) {
              proxyReq.setHeader('X-Forwarded-For', req.headers['x-forwarded-for'])
            }
            // 转发 X-Forwarded-Proto
            if (req.headers['x-forwarded-proto']) {
              proxyReq.setHeader('X-Forwarded-Proto', req.headers['x-forwarded-proto'])
            }
          })
        }
      }
    }
  }
})