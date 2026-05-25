'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  ArrowLeft, Download, FileText, Pause, Play,
  Archive, Trash2, DollarSign, Target, Hash,
  Users, Zap, Calendar, Tag,
} from 'lucide-react'
import { useCampaign, useSetCampaignStatus, useDeleteCampaign } from '@/hooks/useCampaigns'
import { CampaignPipeline } from '@/components/campaigns/CampaignPipeline'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { CampaignStatus } from '@/types/campaign'

function formatCents(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

// ── Detail card row ────────────────────────────────────────────────────────────
function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100">
        <Icon className="h-3.5 w-3.5 text-gray-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
        <div className="mt-0.5 text-sm font-medium text-gray-800 break-words">{value}</div>
      </div>
    </div>
  )
}

// ── Download section ───────────────────────────────────────────────────────────
function DownloadSection({ count }: { count?: number }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500">
          <Download className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-900">Ready to Download</p>
          {count !== undefined && (
            <p className="text-xs text-emerald-700">{count.toLocaleString()} leads available</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          disabled
          title="Backend API coming soon"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white opacity-60 cursor-not-allowed"
        >
          <FileText className="h-3.5 w-3.5" /> CSV
        </button>
        <button
          disabled
          title="Backend API coming soon"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 opacity-60 cursor-not-allowed"
        >
          <FileText className="h-3.5 w-3.5" /> JSON
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-emerald-600 opacity-70">Download API coming soon</p>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const { data: campaign, isLoading, isError } = useCampaign(id)
  const setStatus   = useSetCampaignStatus()
  const deleteCamp  = useDeleteCampaign()

  function handleDelete() {
    if (!campaign) return
    if (!confirm(`Delete "${campaign.name}"? This cannot be undone.`)) return
    deleteCamp.mutate(campaign.id, {
      onSuccess: () => router.push('/dashboard/campaigns'),
    })
  }

  function handleStatus(status: CampaignStatus) {
    if (!campaign) return
    setStatus.mutate({ id: campaign.id, status })
  }

  // ── Loading / error states ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner size="lg" className="text-indigo-600" />
      </div>
    )
  }
  if (isError || !campaign) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center">
        <p className="font-semibold text-red-700">Campaign not found</p>
        <Link href="/dashboard/campaigns" className="mt-4 inline-block text-sm text-red-600 underline">
          Back to campaigns
        </Link>
      </div>
    )
  }

  const keywords     = campaign.keywords?.filter(Boolean) ?? []
  const seedProfiles = campaign.seed_profiles?.filter(Boolean) ?? []
  const aiQueries    = campaign.ai_queries?.filter(Boolean) ?? []
  const isCompleted  = campaign.status === 'completed' || campaign.status === 'archived'

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Breadcrumb + title ──────────────────────────────────────────────── */}
      <div>
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All Campaigns
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          {/* Quick actions */}
          <div className="flex items-center gap-2">
            {campaign.status === 'active' && (
              <Button variant="secondary" size="sm" onClick={() => handleStatus('paused')}>
                <Pause className="h-3.5 w-3.5" /> Pause
              </Button>
            )}
            {campaign.status === 'paused' && (
              <Button variant="secondary" size="sm" onClick={() => handleStatus('active')}>
                <Play className="h-3.5 w-3.5" /> Resume
              </Button>
            )}
            {campaign.status !== 'archived' && (
              <Button variant="secondary" size="sm" onClick={() => handleStatus('archived')}>
                <Archive className="h-3.5 w-3.5" /> Archive
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              loading={deleteCamp.isPending}
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
        {campaign.description && (
          <p className="mt-2 text-sm text-gray-500">{campaign.description}</p>
        )}
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Pipeline — takes 2/3 */}
        <div className="space-y-6 lg:col-span-2">
          <CampaignPipeline campaign={campaign} />

          {/* Download card — only when completed */}
          {isCompleted && <DownloadSection />}
        </div>

        {/* Right sidebar — campaign details */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
            <h2 className="mb-1 text-base font-semibold text-gray-900">Campaign Details</h2>

            <div className="divide-y divide-gray-100">
              <DetailRow icon={Tag} label="Input Type" value={
                <span className="capitalize">{campaign.input_type ?? '—'}</span>
              } />

              {keywords.length > 0 && (
                <DetailRow icon={Hash} label="Keywords" value={
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {keywords.map((k) => (
                      <span key={k} className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {k}
                      </span>
                    ))}
                  </div>
                } />
              )}

              {seedProfiles.length > 0 && (
                <DetailRow icon={Users} label="Seed Profiles" value={
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {seedProfiles.map((p) => (
                      <span key={p} className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                        {p}
                      </span>
                    ))}
                  </div>
                } />
              )}

              {aiQueries.length > 0 && (
                <DetailRow icon={Zap} label="AI Queries" value={
                  <ol className="mt-0.5 space-y-1">
                    {aiQueries.map((q, i) => (
                      <li key={i} className="text-xs text-gray-600">{i + 1}. {q}</li>
                    ))}
                  </ol>
                } />
              )}

              <DetailRow icon={Target} label="Follower Depth" value={`Level ${campaign.follower_depth}`} />

              <DetailRow icon={Users} label="Max Results" value={
                campaign.max_results ? campaign.max_results.toLocaleString() : 'Unlimited'
              } />

              <DetailRow icon={DollarSign} label="Budget" value={formatCents(campaign.budget_cents)} />

              <DetailRow icon={DollarSign} label="Spend" value={formatCents(campaign.spend_cents)} />

              <DetailRow icon={Calendar} label="Created" value={
                format(new Date(campaign.created_at), 'MMM d, yyyy · h:mm a')
              } />

              <DetailRow icon={Calendar} label="Last Updated" value={
                format(new Date(campaign.updated_at), 'MMM d, yyyy · h:mm a')
              } />
            </div>
          </div>

          {/* Stage counts summary card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Results Summary</h2>
            <div className="space-y-3">
              {[
                { label: 'Profiles Found',   value: '—', note: 'pending' },
                { label: 'Profiles Enriched', value: '—', note: 'pending' },
                { label: 'Contacts Validated', value: '—', note: 'pending' },
                { label: 'Leads Ready',       value: '—', note: 'pending' },
              ].map(({ label, value, note }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{label}</span>
                  <span className="text-sm font-semibold tabular-nums text-gray-800">
                    {value}
                    {note === 'pending' && (
                      <span className="ml-1.5 text-xs font-normal text-gray-300">soon</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-400">
              Live counts will populate here once the worker pipeline is connected.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
