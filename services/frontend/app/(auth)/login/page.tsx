'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'

function ExpiredNotice() {
  const searchParams = useSearchParams()
  useEffect(() => {
    if (searchParams.get('reason') === 'expired') {
      toast.error('Your session has expired. Please sign in again.')
    }
  }, [searchParams])
  return null
}

function LoginForm() {
  const { loginMutation } = useAuth()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    loginMutation.mutate({
      email: fd.get('email') as string,
      password: fd.get('password') as string,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900
                     placeholder:text-gray-400 transition-colors
                     focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900
                     placeholder:text-gray-400 transition-colors
                     focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {loginMutation.isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
          {(loginMutation.error as any)?.response?.data?.error ?? 'Invalid credentials. Please try again.'}
        </div>
      )}

      <Button type="submit" loading={loginMutation.isPending} className="w-full" size="lg">
        Sign in
      </Button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="w-full max-w-md animate-fade-in">
      <div className="rounded-2xl bg-white shadow-2xl shadow-black/20 p-8">
        <div className="flex justify-center mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-600/30">
            <Zap className="h-7 w-7 text-white" strokeWidth={2.5} />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 text-center">Welcome back</h1>
        <p className="mt-1 text-sm text-gray-500 text-center mb-8">Sign in to your LGS account</p>

        <Suspense>
          <ExpiredNotice />
        </Suspense>

        <LoginForm />

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors">
            Create one free
          </Link>
        </p>
      </div>
    </div>
  )
}
