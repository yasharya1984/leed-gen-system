# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — deps: install production + dev dependencies with caching
# Using a dedicated stage means Docker can reuse this layer on rebuilds when
# only source files (not package.json) change.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# libc6-compat is required by some Node native modules on Alpine.
RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json* ./
# --omit=dev is NOT used here because devDependencies (typescript, tailwindcss, etc.)
# are required to compile the Next.js app in Stage 2.
RUN npm ci

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — builder: compile Next.js into the standalone output bundle
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* variables are evaluated at build time and baked into the JS
# bundle — they cannot be changed at runtime. Pass the backend URL via the
# docker-compose `build.args` section so each environment gets its own bundle.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — runner: minimal production image (~150 MB vs ~1 GB full image)
#
# Requires `output: 'standalone'` in next.config.ts so Next.js emits a
# self-contained server in .next/standalone/ that does not need node_modules.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# The standalone bundle is a complete Node server — copy it along with the
# static assets which must be nested at .next/static inside the server root.
COPY --from=builder /app/public                      ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js is emitted by Next.js standalone — it is the production entry point.
CMD ["node", "server.js"]
