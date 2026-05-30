// utils/request.ts
function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('authToken')
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  }
  return fetch(url, { ...options, headers })
}