import { clsx } from 'clsx'
import type { CampaignStatus } from '@/types/campaign'

interface StatusBadgeProps {
  status: CampaignStatus
  size?: 'sm' | 'md'
}

const CONFIG: Record<CampaignStatus, { label: string; badge: string; dot: string }> = {
  active:    { label: 'Active',    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20', dot: 'bg-emerald-500' },
  paused:    { label: 'Paused',    badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20',       dot: 'bg-amber-400' },
  completed: { label: 'Completed', badge: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20',             dot: 'bg-sky-500' },
  archived:  { label: 'Archived',  badge: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-500/10',         dot: 'bg-gray-400' },
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const cfg = CONFIG[status] ?? CONFIG.archived
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        cfg.badge,
      )}
    >
      <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}
