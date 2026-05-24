import axios from 'axios'
import Cookies from 'js-cookie'

export const TOKEN_COOKIE = 'lgs_session'
export const USER_STORAGE_KEY = 'lgs_user'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
})

// Attach the Bearer token from the session cookie to every outbound request.
api.interceptors.request.use((config) => {
  const token = Cookies.get(TOKEN_COOKIE)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// NOTE: The 403 response interceptor lives in providers/Providers.tsx because
// it needs access to the QueryClient and Next.js router for cache invalidation
// and redirect. This file only owns the Axios instance and token plumbing.
