'use client'

import { format } from 'date-fns'
import {
  Sparkles, Clock, Users, UserCheck,
  ClipboardCheck, ListChecks, Download,
  CheckCircle, Loader, PauseCircle,
} from 'lucide-react'
import type { PipelineStage, PipelineStageId } from '@/types/pipeline'
import type { Campaign } from '@/types/campaign'

// ── Stage icon map ─────────────────────────────────────────────────────────────
const STAGE_ICONS: Record<PipelineStageId, React.ElementType> = {
  created:              Sparkles,
  queued:               Clock,
  collecting_profiles:  Users,
  enriching_profiles:   UserCheck,
  reviewing_data:       ClipboardCheck,
  preparing_list:       ListChecks,
  ready_to_download:    Download,
}

// ── Derive pipeline from campaign status (placeholder until backend stages API) ─
const STAGE_DEFS: Omit<PipelineStage, 'status'>[] = [
  { id: 'created',             label: 'Created',                description: 'Campaign configured and saved',               countLabel: undefined },
  { id: 'queued',              label: 'Queued',                 description: 'Waiting for a worker to pick up',             countLabel: undefined },
  { id: 'collecting_profiles', label: 'Collecting Profiles',   description: 'Scraping social profiles matching your input', countLabel: 'profiles found' },
  { id: 'enriching_profiles',  label: 'Enriching Profiles',    description: 'Fetching emails, phones, and company details', countLabel: 'profiles enriched' },
  { id: 'reviewing_data',      label: 'Reviewing Data',        description: 'Validating and deduplicating contacts',        countLabel: 'contacts validated' },
  { id: 'preparing_list',      label: 'Preparing List',        description: 'Scoring, ranking, and formatting your leads', countLabel: 'leads scored' },
  { id: 'ready_to_download',   label: 'Ready to Download',     description: 'Your lead list is ready',                     countLabel: 'leads ready' },
]

function deriveStages(campaign: Campaign): PipelineStage[] {
  // Map campaign.status → the index of the "current" stage.
  const currentIdx =
    campaign.status === 'completed' || campaign.status === 'archived' ? 6
    : campaign.status === 'active'  ? 2   // collecting_profiles
    : 1                                   // queued / paused

  return STAGE_DEFS.map((def, idx) => {
    let status: PipelineStage['status']
    if (idx < currentIdx) {
      status = 'completed'
    } else if (idx === currentIdx) {
      status =
        campaign.status === 'paused'                                          ? 'paused'
        : campaign.status === 'completed' || campaign.status === 'archived'  ? 'completed'
        : 'current'
    } else {
      status = 'pending'
    }
    return { ...def, status }
  })
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StageIcon({ stageId, status }: { stageId: PipelineStageId; status: PipelineStage['status'] }) {
  const Icon = STAGE_ICONS[stageId]

  if (status === 'completed') {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/30">
        <CheckCircle className="h-5 w-5 text-white" />
      </div>
    )
  }
  if (status === 'current') {
    return (
      <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 shadow-sm shadow-indigo-600/30">
        <span className="absolute inset-0 animate-ping rounded-full bg-indigo-400 opacity-30" />
        <Icon className="h-4 w-4 text-white" />
      </div>
    )
  }
  if (status === 'paused') {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 shadow-sm shadow-amber-400/30">
        <PauseCircle className="h-5 w-5 text-white" />
      </div>
    )
  }
  // pending
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-gray-200 bg-white">
      <Icon className="h-4 w-4 text-gray-300" />
    </div>
  )
}

function ConnectorLine({ done }: { done: boolean }) {
  return (
    <div className="ml-4 h-8 w-0.5 shrink-0" style={{
      background: done
        ? 'linear-gradient(to bottom, #10b981, #10b981)'
        : '#e5e7eb',
    }} />
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface CampaignPipelineProps {
  campaign: Campaign
}

export function CampaignPipeline({ campaign }: CampaignPipelineProps) {
  const stages = deriveStages(campaign)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
      <h2 className="mb-6 text-base font-semibold text-gray-900">Pipeline Progress</h2>

      <ol className="space-y-0">
        {stages.map((stage, idx) => {
          const isLast    = idx === stages.length - 1
          const Icon      = STAGE_ICONS[stage.id]
          const isActive  = stage.status === 'current'
          const isDone    = stage.status === 'completed'
          const isPaused  = stage.status === 'paused'
          const isPending = stage.status === 'pending'

          return (
            <li key={stage.id}>
              <div className="flex items-start gap-4">
                {/* Icon column */}
                <div className="flex flex-col items-center">
                  <StageIcon stageId={stage.id} status={stage.status} />
                  {!isLast && <ConnectorLine done={isDone} />}
                </div>

                {/* Content */}
                <div className={`pb-${isLast ? '0' : '2'} min-w-0 flex-1 pt-1.5`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-semibold ${
                      isDone    ? 'text-emerald-700'
                      : isActive ? 'text-indigo-700'
                      : isPaused ? 'text-amber-700'
                      : 'text-gray-400'
                    }`}>
                      {stage.label}
                    </span>

                    {isActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                        <Loader className="h-3 w-3 animate-spin" /> In progress
                      </span>
                    )}
                    {isPaused && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                        Paused
                      </span>
                    )}

                    {/* Count badge */}
                    {stage.count !== undefined && stage.countLabel && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-gray-700">
                        {stage.count.toLocaleString()} {stage.countLabel}
                      </span>
                    )}
                  </div>

                  <p className={`mt-0.5 text-xs ${isPending ? 'text-gray-300' : 'text-gray-500'}`}>
                    {isPending ? 'Waiting…'
                      : isActive ? stage.description
                      : isPaused ? 'Paused — resume the campaign to continue'
                      : stage.description}
                  </p>

                  {isDone && stage.completedAt && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      {format(new Date(stage.completedAt), 'MMM d, yyyy · h:mm a')}
                    </p>
                  )}
                </div>
              </div>
              {/* gap between items */}
              {!isLast && <div className="h-0" />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
