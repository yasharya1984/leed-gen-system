'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import type { Campaign, CreateCampaignInput, CampaignStatus, UpdateCampaignInput } from '@/types/campaign'

export const CAMPAIGNS_KEY = ['campaigns'] as const

export function useCampaign(id: string) {
  return useQuery<Campaign>({
    queryKey: [...CAMPAIGNS_KEY, id],
    queryFn: () => api.get<Campaign>(`/api/v1/campaigns/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

// Fetch all campaigns for the authenticated user, with an optional status filter.
export function useCampaigns(status?: CampaignStatus) {
  const queryKey = status ? [...CAMPAIGNS_KEY, { status }] : CAMPAIGNS_KEY
  return useQuery<Campaign[]>({
    queryKey,
    queryFn: () => {
      const qs = status ? `?status=${status}` : ''
      return api.get<Campaign[]>(`/api/v1/campaigns${qs}`).then((r) => r.data ?? [])
    },
  })
}

export function useCreateCampaign() {
  const queryClient = useQueryClient()
  return useMutation<Campaign, Error, CreateCampaignInput>({
    mutationFn: (input) =>
      api.post<Campaign>('/api/v1/campaigns', input).then((r) => r.data),
    onSuccess: (campaign) => {
      // Invalidate the full campaign list so every status-filtered view refreshes.
      queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY })
      toast.success(`"${campaign.name}" created successfully.`)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error ?? 'Failed to create campaign.')
    },
  })
}

export function useUpdateCampaign(id: string) {
  const queryClient = useQueryClient()
  return useMutation<Campaign, Error, UpdateCampaignInput>({
    mutationFn: (input) =>
      api.patch<Campaign>(`/api/v1/campaigns/${id}`, input).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY })
      toast.success('Campaign updated.')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error ?? 'Failed to update campaign.')
    },
  })
}

export function useSetCampaignStatus() {
  const queryClient = useQueryClient()
  return useMutation<Campaign, Error, { id: string; status: CampaignStatus }>({
    mutationFn: ({ id, status }) =>
      api.patch<Campaign>(`/api/v1/campaigns/${id}/status`, { status }).then((r) => r.data),
    onSuccess: (campaign) => {
      queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY })
      toast.success(`Campaign set to ${campaign.status}.`)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error ?? 'Failed to update status.')
    },
  })
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete(`/api/v1/campaigns/${id}`).then(() => undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CAMPAIGNS_KEY })
      toast.success('Campaign deleted.')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error ?? 'Failed to delete campaign.')
    },
  })
}
