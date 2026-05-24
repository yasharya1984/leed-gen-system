'use client'

import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import toast from 'react-hot-toast'
import { api, TOKEN_COOKIE, USER_STORAGE_KEY } from '@/lib/api'
import type { User, LoginCredentials, RegisterCredentials, AuthResponse } from '@/types/auth'

export const AUTH_QUERY_KEY = ['auth', 'user'] as const

function readStoredUser(): User | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_STORAGE_KEY)
  try {
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function useAuth() {
  const queryClient = useQueryClient()
  const router = useRouter()

  // User data is seeded from localStorage on mount so the UI renders instantly
  // without a network round-trip. The cache is kept warm for the session.
  const { data: user } = useQuery<User | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: readStoredUser,
    staleTime: Infinity,
    initialData: readStoredUser,
  })

  const loginMutation = useMutation<AuthResponse, Error, LoginCredentials>({
    mutationFn: (creds) =>
      api.post<AuthResponse>('/api/v1/auth/login', creds).then((r) => r.data),
    onSuccess: (data) => {
      // Persist token in a cookie (readable by middleware.ts for SSR redirects)
      // and seed the React Query cache with user data.
      Cookies.set(TOKEN_COOKIE, data.token, { expires: 1, sameSite: 'lax' })
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user))
      queryClient.setQueryData(AUTH_QUERY_KEY, data.user)
      toast.success(`Welcome back, ${data.user.name}!`)
      router.push('/dashboard/campaigns')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error ?? 'Invalid credentials. Please try again.')
    },
  })

  const registerMutation = useMutation<AuthResponse, Error, RegisterCredentials>({
    mutationFn: (creds) =>
      api.post<AuthResponse>('/api/v1/auth/register', creds).then((r) => r.data),
    onSuccess: () => {
      toast.success('Account created! Please sign in.')
      router.push('/login')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error ?? 'Registration failed. Please try again.')
    },
  })

  const logout = useCallback(() => {
    Cookies.remove(TOKEN_COOKIE)
    localStorage.removeItem(USER_STORAGE_KEY)
    queryClient.clear()
    toast.success('Signed out successfully.')
    router.push('/login')
  }, [queryClient, router])

  return { user: user ?? null, loginMutation, registerMutation, logout }
}
