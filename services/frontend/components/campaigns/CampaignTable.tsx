'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  Megaphone,
  MoreHorizontal,
  Pause,
  Play,
  Archive,
  Trash2,
  CheckCircle,
} from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useSetCampaignStatus, useDeleteCampaign } from '@/hooks/useCampaigns'
import type { Campaign, CampaignStatus } from '@/types/campaign'

function formatCents(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

interface CampaignTableProps {
  campaigns: Campaign[]
  onCreateNew: () => void
}

interface Rect { top: number; right: number }

interface ActionMenuProps {
  campaign: Campaign
  anchor: Rect
  onClose: () => void
}

function ActionMenu({ campaign, anchor, onClose }: ActionMenuProps) {
  const setStatus  = useSetCampaignStatus()
  const deleteCamp = useDeleteCampaign()
  const menuRef    = useRef<HTMLDivElement>(null)

  // Adjust position if the menu would overflow the bottom of the viewport.
  const [style, setStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    top: anchor.top + 8,
    right: window.innerWidth - anchor.right,
    zIndex: 9999,
  })

  useEffect(() => {
    if (!menuRef.current) return
    const menuHeight = menuRef.current.offsetHeight
    const spaceBelow = window.innerHeight - anchor.top - 8
    if (menuHeight > spaceBelow) {
      // Flip upward
      setStyle((s) => ({ ...s, top: anchor.top - menuHeight - 8 }))
    }
  }, [anchor.top])

  function transition(status: CampaignStatus) {
    setStatus.mutate({ id: campaign.id, status })
    onClose()
  }

  const menu = (
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        ref={menuRef}
        style={style}
        className="w-48 animate-fade-in rounded-xl border border-gray-200 bg-white py-1 shadow-lg shadow-black/10"
      >
        {campaign.status !== 'active' && campaign.status !== 'completed' && (
          <button
            onClick={() => transition('active')}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Play className="h-3.5 w-3.5 text-emerald-600" /> Activate
          </button>
        )}
        {campaign.status === 'active' && (
          <button
            onClick={() => transition('paused')}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Pause className="h-3.5 w-3.5 text-amber-500" /> Pause
          </button>
        )}
        {campaign.status !== 'completed' && (
          <button
            onClick={() => transition('completed')}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <CheckCircle className="h-3.5 w-3.5 text-sky-500" /> Mark complete
          </button>
        )}
        {campaign.status !== 'archived' && (
          <button
            onClick={() => transition('archived')}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Archive className="h-3.5 w-3.5 text-gray-400" /> Archive
          </button>
        )}
        <div className="my-1 border-t border-gray-100" />
        <button
          onClick={() => { deleteCamp.mutate(campaign.id); onClose() }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </>
  )

  // Portal to body so overflow:hidden on the table never clips the menu.
  return typeof document !== 'undefined' ? createPortal(menu, document.body) : null
}

export function CampaignTable({ campaigns, onCreateNew }: CampaignTableProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<Rect>({ top: 0, right: 0 })

  function handleTrigger(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    if (openMenu === id) {
      setOpenMenu(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuAnchor({ top: rect.bottom, right: rect.right })
    setOpenMenu(id)
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
          <Megaphone className="h-7 w-7 text-indigo-500" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">No campaigns found</h3>
        <p className="mt-1.5 text-sm text-gray-500 max-w-xs">
          Create your first campaign to start discovering and enriching leads.
        </p>
        <Button onClick={onCreateNew} className="mt-5">
          Create Campaign
        </Button>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead>
            <tr className="bg-gray-50/80">
              {['Campaign', 'Status', 'Input', 'Budget', 'Spend', 'Created', ''].map((h) => (
                <th
                  key={h}
                  className={`px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 ${
                    h === '' ? 'text-right' : ''
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="group transition-colors hover:bg-indigo-50/30">
                {/* Name */}
                <td className="px-5 py-4">
                  <Link
                    href={`/dashboard/campaigns/${campaign.id}`}
                    className="text-sm font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
                  >
                    {campaign.name}
                  </Link>
                  {campaign.description && (
                    <p className="mt-0.5 max-w-[220px] truncate text-xs text-gray-400">
                      {campaign.description}
                    </p>
                  )}
                </td>

                {/* Status */}
                <td className="px-5 py-4">
                  <StatusBadge status={campaign.status} />
                </td>

                {/* Input type */}
                <td className="px-5 py-4">
                  <span className="text-xs font-medium capitalize text-gray-500">
                    {campaign.input_type ?? '—'}
                  </span>
                </td>

                {/* Budget */}
                <td className="px-5 py-4 text-sm text-gray-700 tabular-nums">
                  {formatCents(campaign.budget_cents)}
                </td>

                {/* Spend */}
                <td className="px-5 py-4 text-sm text-gray-700 tabular-nums">
                  {formatCents(campaign.spend_cents)}
                </td>

                {/* Created */}
                <td className="px-5 py-4 text-sm text-gray-400">
                  {format(new Date(campaign.created_at), 'MMM d, yyyy')}
                </td>

                {/* Actions */}
                <td className="px-5 py-4 text-right">
                  <button
                    onClick={(e) => handleTrigger(e, campaign.id)}
                    className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600 group-hover:text-gray-400"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {openMenu === campaign.id && (
                    <ActionMenu
                      campaign={campaign}
                      anchor={menuAnchor}
                      onClose={() => setOpenMenu(null)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3">
        <p className="text-xs text-gray-400">
          {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}
