export type CampaignStatus = 'active' | 'paused' | 'completed' | 'archived'

export interface Campaign {
  id: string
  name: string
  description?: string
  status: CampaignStatus
  input_type?: string
  keywords: string[]
  seed_profiles: string[]
  ai_queries: string[]
  follower_depth: number
  max_results?: number
  user_id?: string
  budget_cents: number
  spend_cents: number
  created_at: string
  updated_at: string
  metadata?: Record<string, unknown>
}

export interface CreateCampaignInput {
  name: string
  description?: string
  input_type?: string
  keywords?: string[]
  seed_profiles?: string[]
  ai_queries?: string[]
  follower_depth?: number
  max_results?: number
  budget_cents?: number
}

export interface UpdateCampaignInput {
  name?: string
  description?: string
  status?: CampaignStatus
  max_results?: number
  budget_cents?: number
}
