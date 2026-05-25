export type PipelineStageId =
  | 'created'
  | 'queued'
  | 'collecting_profiles'
  | 'enriching_profiles'
  | 'reviewing_data'
  | 'preparing_list'
  | 'ready_to_download'

export type StageStatus = 'completed' | 'current' | 'paused' | 'pending'

export interface PipelineStage {
  id: PipelineStageId
  label: string
  description: string
  status: StageStatus
  count?: number          // populated by backend when available
  countLabel?: string     // e.g. "profiles found", "leads ready"
  completedAt?: string    // ISO timestamp
}
