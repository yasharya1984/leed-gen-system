import axios from 'axios'
import Cookies from 'js-cookie'

export const TOKEN_COOKIE = 'lgs_session'
export const USER_STORAGE_KEY = 'lgs_user'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
})

function currentUser() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    if (!raw) return null
    const u = JSON.parse(raw)
    return u as { id: string; name: string; email: string; role: string } | null
  } catch {
    return null
  }
}

// ── Request interceptor ────────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = Cookies.get(TOKEN_COOKIE)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // Stamp the start time so the response interceptor can compute duration.
  ;(config as any)._t = Date.now()

  const user = currentUser()
  const actor = user ? `${user.name} <${user.email}> [${user.role}]` : 'anonymous'
  const url   = `${config.method?.toUpperCase()} ${config.baseURL ?? ''}${config.url}`

  const extra: Record<string, unknown> = {}
  if (config.params && Object.keys(config.params).length) extra.params = config.params
  if (config.data) {
    try {
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
      // Strip password from logs.
      const { password: _p, ...safe } = body ?? {}
      if (Object.keys(safe).length) extra.body = safe
    } catch { /* non-JSON body */ }
  }

  console.groupCollapsed(`%c→ ${url}`, 'color:#6366f1;font-weight:600')
  console.log('actor :', actor)
  if (Object.keys(extra).length) console.log('data  :', extra)
  console.groupEnd()

  return config
})

// ── Response interceptors ─────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => {
    const ms  = Date.now() - ((response.config as any)._t ?? Date.now())
    const url = `${response.config.method?.toUpperCase()} ${response.config.url}`

    console.groupCollapsed(`%c← ${response.status} ${url} (${ms}ms)`, 'color:#22c55e;font-weight:600')
    if (response.data) console.log('data  :', response.data)
    console.groupEnd()

    return response
  },
  (error) => {
    const ms     = Date.now() - ((error.config as any)?._t ?? Date.now())
    const status = error.response?.status ?? 'ERR'
    const url    = `${error.config?.method?.toUpperCase()} ${error.config?.url}`

    console.groupCollapsed(`%c✗ ${status} ${url} (${ms}ms)`, 'color:#ef4444;font-weight:600')
    if (error.response?.data) console.log('error :', error.response.data)
    console.groupEnd()

    // NOTE: The 403 interceptor (session expiry redirect) lives in
    // providers/Providers.tsx — it needs QueryClient and router.
    return Promise.reject(error)
  },
)
