'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useCreateCampaign } from '@/hooks/useCampaigns'
import { Button } from '@/components/ui/Button'
import type { CreateCampaignInput } from '@/types/campaign'

interface CampaignCreateModalProps {
  open: boolean
  onClose: () => void
}

const INPUT_TYPES = [
  { value: 'keywords',  label: 'Keyword Search',  hint: 'Enter comma-separated search keywords' },
  { value: 'profiles',  label: 'Seed Profiles',   hint: 'Enter @handles to scrape followers from' },
  { value: 'ai_queries', label: 'AI Queries',     hint: 'Enter one AI search query per line' },
]

const LABEL = 'block text-sm font-medium text-gray-700 mb-1.5'
const INPUT  = 'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20'

export function CampaignCreateModal({ open, onClose }: CampaignCreateModalProps) {
  const createCampaign = useCreateCampaign()
  const [inputType, setInputType] = useState('keywords')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    const rawKeywords     = ((fd.get('keywords')      as string) ?? '').trim()
    const rawProfiles     = ((fd.get('seed_profiles') as string) ?? '').trim()
    const rawAiQueries    = ((fd.get('ai_queries')    as string) ?? '').trim()
    const budgetDollars   = parseFloat((fd.get('budget_dollars') as string) || '0')
    const maxResultsRaw   = ((fd.get('max_results')  as string) ?? '').trim()

    const input: CreateCampaignInput = {
      name:          ((fd.get('name') as string) ?? '').trim(),
      description:   ((fd.get('description') as string) ?? '').trim() || undefined,
      input_type:    inputType,
      follower_depth: Number(fd.get('follower_depth')),
      max_results:   maxResultsRaw ? Number(maxResultsRaw) : undefined,
      budget_cents:  Math.round(budgetDollars * 100),

      keywords:      inputType === 'keywords' && rawKeywords
        ? rawKeywords.split(',').map((k) => k.trim()).filter(Boolean)
        : undefined,

      seed_profiles: inputType === 'profiles' && rawProfiles
        ? rawProfiles.split(',').map((p) => p.trim()).filter(Boolean)
        : undefined,

      ai_queries:    inputType === 'ai_queries' && rawAiQueries
        ? rawAiQueries.split('\n').map((q) => q.trim()).filter(Boolean)
        : undefined,
    }

    createCampaign.mutate(input, {
      onSuccess: () => {
        onClose()
        e.currentTarget?.reset()
        setInputType('keywords')
      },
    })
  }

  if (!open) return null

  const activeType = INPUT_TYPES.find((t) => t.value === inputType)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-lg animate-fade-in rounded-2xl bg-white shadow-2xl shadow-black/20 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Create Campaign</h2>
              <p className="mt-0.5 text-sm text-gray-500">Configure your lead generation campaign</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
            {/* Name */}
            <div>
              <label htmlFor="name" className={LABEL}>
                Campaign name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="e.g. SaaS Founders — Q3 2026"
                className={INPUT}
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className={LABEL}>Description</label>
              <textarea
                id="description"
                name="description"
                rows={2}
                placeholder="Brief campaign goals or notes…"
                className={`${INPUT} resize-none`}
              />
            </div>

            {/* Input type selector */}
            <div>
              <label className={LABEL}>Input type</label>
              <div className="flex gap-2">
                {INPUT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setInputType(t.value)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      inputType === t.value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic input field */}
            {inputType !== 'ai_queries' ? (
              <div>
                <label htmlFor={inputType} className={LABEL}>
                  {activeType?.label}
                </label>
                <input
                  id={inputType}
                  name={inputType === 'profiles' ? 'seed_profiles' : inputType}
                  type="text"
                  placeholder={activeType?.hint}
                  className={INPUT}
                />
                <p className="mt-1 text-xs text-gray-400">Comma-separated values</p>
              </div>
            ) : (
              <div>
                <label htmlFor="ai_queries" className={LABEL}>AI Queries</label>
                <textarea
                  id="ai_queries"
                  name="ai_queries"
                  rows={3}
                  placeholder="One query per line…"
                  className={`${INPUT} resize-none`}
                />
              </div>
            )}

            {/* Follower depth + max results */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="follower_depth" className={LABEL}>Follower depth</label>
                <select id="follower_depth" name="follower_depth" defaultValue="1" className={INPUT}>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>
                      {d === 1 ? 'Level 1 (direct)' : `Level ${d}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="max_results" className={LABEL}>Max results</label>
                <input
                  id="max_results"
                  name="max_results"
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  className={INPUT}
                />
              </div>
            </div>

            {/* Budget */}
            <div>
              <label htmlFor="budget_dollars" className={LABEL}>Budget (USD)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  $
                </span>
                <input
                  id="budget_dollars"
                  name="budget_dollars"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  className={`${INPUT} pl-7`}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/50 px-6 py-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={createCampaign.isPending}>
              Create Campaign
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
