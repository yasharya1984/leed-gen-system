'use client'

import { useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { useCampaigns } from '@/hooks/useCampaigns'
import { CampaignTable } from '@/components/campaigns/CampaignTable'
import { CampaignCreateModal } from '@/components/campaigns/CampaignCreateModal'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import type { CampaignStatus } from '@/types/campaign'

const STATUS_FILTERS: { label: string; value: CampaignStatus | undefined }[] = [
  { label: 'All',       value: undefined },
  { label: 'Active',    value: 'active' },
  { label: 'Paused',    value: 'paused' },
  { label: 'Completed', value: 'completed' },
  { label: 'Archived',  value: 'archived' },
]

export default function CampaignsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | undefined>(undefined)
  const { data: campaigns, isLoading, isError, refetch, isFetching } = useCampaigns(statusFilter)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and monitor your lead generation campaigns.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            New Campaign
          </Button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={label}
            onClick={() => setStatusFilter(value)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content states */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" className="text-indigo-600" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-semibold text-red-700">Failed to load campaigns</p>
          <p className="mt-1 text-xs text-red-500">Please try refreshing the page.</p>
          <Button variant="secondary" className="mt-4" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <CampaignTable campaigns={campaigns ?? []} onCreateNew={() => setShowCreate(true)} />
      )}

      <CampaignCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
