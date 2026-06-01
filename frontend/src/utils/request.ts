// utils/request.ts

// 添加 export 关键字以导出该函数
export function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('authToken')
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  }
  return fetch(url, { ...options, headers })
}