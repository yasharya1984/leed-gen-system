'use client'

import Link from 'next/link'
import { Zap } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'

export default function SignupPage() {
  const { registerMutation } = useAuth()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    registerMutation.mutate({
      name: fd.get('name') as string,
      email: fd.get('email') as string,
      password: fd.get('password') as string,
    })
  }

  return (
    <div className="w-full max-w-md animate-fade-in">
      <div className="rounded-2xl bg-white shadow-2xl shadow-black/20 p-8">
        <div className="flex justify-center mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-600/30">
            <Zap className="h-7 w-7 text-white" strokeWidth={2.5} />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 text-center">Create your account</h1>
        <p className="mt-1 text-sm text-gray-500 text-center mb-8">Start generating leads today</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="name"
              placeholder="Jane Smith"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900
                         placeholder:text-gray-400 transition-colors
                         focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
              Work email
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
              minLength={8}
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900
                         placeholder:text-gray-400 transition-colors
                         focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {registerMutation.isError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
              {(registerMutation.error as any)?.response?.data?.error ?? 'Registration failed. Please try again.'}
            </div>
          )}

          <Button type="submit" loading={registerMutation.isPending} className="w-full" size="lg">
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
