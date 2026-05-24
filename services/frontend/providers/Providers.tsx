'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import Cookies from 'js-cookie'
import { api, TOKEN_COOKIE, USER_STORAGE_KEY } from '@/lib/api'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,        // 1 min before re-fetching in background
        gcTime: 5 * 60 * 1000,       // 5 min before garbage collecting
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  })
}

export function Providers({ children }: { children: React.ReactNode }) {
  // useState guarantees a single QueryClient per browser session.
  const [queryClient] = useState(makeQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {/* Registers the 403 interceptor inside the QueryClient context so it
          can call queryClient.clear() and useRouter without prop-drilling. */}
      <ForbiddenInterceptor queryClient={queryClient} />
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { borderRadius: '10px', fontSize: '14px', maxWidth: '400px' },
          success: {
            style: { background: '#f0fdf4', color: '#14532d', border: '1px solid #bbf7d0' },
            iconTheme: { primary: '#22c55e', secondary: '#f0fdf4' },
          },
          error: {
            style: { background: '#fef2f2', color: '#7f1d1d', border: '1px solid #fecaca' },
            iconTheme: { primary: '#ef4444', secondary: '#fef2f2' },
          },
        }}
      />
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </QueryClientProvider>
  )
}

// Separate component so useRouter() runs inside QueryClientProvider context.
function ForbiddenInterceptor({ queryClient }: { queryClient: QueryClient }) {
  const router = useRouter()

  useEffect(() => {
    const id = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 403) {
          // Wipe local session state immediately.
          Cookies.remove(TOKEN_COOKIE)
          if (typeof window !== 'undefined') {
            localStorage.removeItem(USER_STORAGE_KEY)
          }
          // Flush all cached server state so stale data doesn't persist
          // after the user signs back in as a different account.
          queryClient.clear()
          toast.error('Your session has expired. Please sign in again.')
          router.push('/login?reason=expired')
        }
        return Promise.reject(error)
      }
    )
    // Clean up on unmount to avoid duplicate interceptors during HMR.
    return () => api.interceptors.response.eject(id)
  }, [queryClient, router])

  return null
}
