export type UserRole = 'admin' | 'user' | 'viewer'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  is_active: boolean
  last_login_at?: string
  created_at: string
  updated_at: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
  name: string
  role?: UserRole
}

export interface AuthResponse {
  user: User
  token: string
}
