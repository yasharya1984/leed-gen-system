import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // `standalone` emits a self-contained server in .next/standalone/ that
  // does not need node_modules at runtime — required by the production Dockerfile.
  output: 'standalone',

  // Expose the backend base URL to client components.
  // In Docker this is overridden at build time via ARG NEXT_PUBLIC_API_URL.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080',
  },
}

export default nextConfig
