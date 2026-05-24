# LGS Frontend

Next.js 15 (App Router) web application for the Lead Generation System. Provides campaign management, lead tracking, and secure user authentication.

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v3 + `@tailwindcss/forms` |
| Server state | TanStack React Query v5 |
| HTTP client | Axios |
| Auth tokens | `js-cookie` (cookie storage for SSR middleware access) |
| Icons | Lucide React |
| Toasts | react-hot-toast |

## Setup

```bash
cd frontend
npm install
cp .env.local .env.local   # already committed with defaults
npm run dev                 # http://localhost:3000
```

The app expects the Go API gateway to be running on `http://localhost:8080`. Override via `.env.local`:

```
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

## Directory Structure

```
frontend/
├── app/                         # Next.js App Router pages
│   ├── layout.tsx               # Root layout — wraps all routes with <Providers>
│   ├── page.tsx                 # Root "/" — redirects to /dashboard/campaigns
│   ├── (auth)/                  # Public auth route group (no sidebar)
│   │   ├── layout.tsx           # Centered dark-gradient background
│   │   ├── login/page.tsx       # Login form + session-expired notice
│   │   └── signup/page.tsx      # Registration form
│   └── (dashboard)/             # Protected route group
│       ├── layout.tsx           # Sidebar + scrollable main area
│       └── dashboard/
│           └── campaigns/
│               └── page.tsx     # Campaign list, filter tabs, create modal
│
├── components/
│   ├── layout/
│   │   └── Sidebar.tsx          # Dark sidebar with nav + user profile + logout
│   ├── campaigns/
│   │   ├── CampaignTable.tsx    # Data table with status badge, action menu
│   │   └── CampaignCreateModal.tsx  # Multi-step form modal
│   └── ui/
│       ├── Button.tsx           # Primary / Secondary / Ghost / Danger variants
│       ├── Spinner.tsx          # Animated SVG loading indicator
│       └── StatusBadge.tsx      # Color-coded campaign status pill
│
├── hooks/
│   ├── useAuth.ts               # login, register, logout mutations + user state
│   └── useCampaigns.ts          # useQuery + useMutation wrappers for /campaigns API
│
├── lib/
│   └── api.ts                   # Axios instance — attaches Bearer token from cookie
│
├── middleware.ts                 # Next.js Edge Middleware — guards /dashboard routes
│
├── providers/
│   └── Providers.tsx            # QueryClientProvider + 403 interceptor + Toaster
│
└── types/
    ├── auth.ts                  # User, LoginCredentials, AuthResponse
    └── campaign.ts              # Campaign, CreateCampaignInput, CampaignStatus
```

## Authentication Flow

```
1. POST /api/v1/auth/login → { user, token }
2. Token stored in cookie `lgs_session` (readable by middleware.ts)
   User object stored in localStorage `lgs_user` (instant re-hydration)
3. Every Axios request attaches: Authorization: Bearer <token>
4. On 403 response → ForbiddenInterceptor clears cookie + cache → redirects /login?reason=expired
5. middleware.ts reads cookie on each navigation → redirects if absent
```

## Session Expiry Configuration

The token lifetime is set **server-side** via the `JWT_EXPIRY_HOURS` environment variable on the `api-gateway`. The browser cookie expiry is set to match (default: 1 day).

```bash
# api-gateway .env
JWT_EXPIRY_HOURS=24   # default — 24-hour sessions
JWT_EXPIRY_HOURS=1    # short sessions for sensitive environments
JWT_EXPIRY_HOURS=168  # 7-day "remember me" sessions
```

The `lgs_session` cookie expires at the same interval (`Cookies.set(TOKEN_COOKIE, token, { expires: JWT_EXPIRY_HOURS / 24 })`). If the session cookie is cleared or the JWT expires, the next API call will receive a 403, which triggers the interceptor and redirects to `/login`.

## Route Protection

`middleware.ts` runs on the Next.js Edge Runtime before any page renders:

```
/dashboard/*  → requires lgs_session cookie  → redirects to /login if absent
/login        → blocked if already logged in  → redirects to /dashboard/campaigns
/signup       → blocked if already logged in  → redirects to /dashboard/campaigns
```

## Status Badge Color Coding

| Status | Color |
|--------|-------|
| `active` | Green (emerald) |
| `paused` | Amber |
| `completed` | Sky blue |
| `archived` | Gray |

## Adding New Protected Pages

1. Create the page under `app/(dashboard)/dashboard/<route>/page.tsx`
2. Middleware automatically protects it (no extra config needed — it matches `/dashboard/*`)
3. Use `useAuth()` to access `user` and `logout`
4. Use React Query hooks in `hooks/` for data fetching
