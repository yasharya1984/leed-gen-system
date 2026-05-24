import { redirect } from 'next/navigation'

// Root "/" redirects to the campaigns dashboard.
// middleware.ts will further redirect to /login if no session cookie is present.
export default function RootPage() {
  redirect('/dashboard/campaigns')
}
