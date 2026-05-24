import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const TOKEN_COOKIE = 'lgs_session'

// Routes that require an authenticated session.
const PROTECTED_PREFIXES = ['/dashboard']

// Auth routes — authenticated users are bounced back to the dashboard.
const AUTH_PREFIXES = ['/login', '/signup']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(TOKEN_COOKIE)?.value

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  const isAuthRoute = AUTH_PREFIXES.some((p) => pathname.startsWith(p))

  if (isProtected && !token) {
    // Block and redirect to login; preserve the original destination so we
    // could implement a ?next= redirect after login in the future.
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (isAuthRoute && token) {
    // Already logged in — skip the auth pages entirely.
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard/campaigns'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Run on every route except Next.js internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
