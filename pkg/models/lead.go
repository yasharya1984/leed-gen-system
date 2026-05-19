package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type ValidationStatus string
type EnrichmentStatus string
type LeadStage string

const (
	ValidationPending ValidationStatus = "pending"
	ValidationValid   ValidationStatus = "valid"
	ValidationInvalid ValidationStatus = "invalid"
	ValidationBounced ValidationStatus = "bounced"

	EnrichmentUnenriched EnrichmentStatus = "unenriched"
	EnrichmentEnriching  EnrichmentStatus = "enriching"
	EnrichmentEnriched   EnrichmentStatus = "enriched"
	EnrichmentFailed     EnrichmentStatus = "failed"

	StageRaw       LeadStage = "raw"
	StageValidated LeadStage = "validated"
	StageEnriched  LeadStage = "enriched"
	StageContacted LeadStage = "contacted"
	StageQualified LeadStage = "qualified"
)

type Lead struct {
	ID               uuid.UUID        `json:"id"`
	CampaignID       uuid.UUID        `json:"campaign_id"`
	ProfileID        uuid.UUID        `json:"profile_id"`
	Email            *string          `json:"email,omitempty"`
	PhoneE164        *string          `json:"phone_e164,omitempty"`
	EmailType        *string          `json:"email_type,omitempty"`
	PhoneType        *string          `json:"phone_type,omitempty"`
	ConfidenceScore  *int             `json:"confidence_score,omitempty"`
	SourceType       *string          `json:"source_type,omitempty"`
	ValidationStatus ValidationStatus `json:"validation_status"`
	EnrichmentStatus EnrichmentStatus `json:"enrichment_status"`
	Stage            LeadStage        `json:"stage"`
	CreatedAt        time.Time        `json:"created_at"`
	UpdatedAt        time.Time        `json:"updated_at"`
	DeletedAt        *time.Time       `json:"deleted_at,omitempty"`
	Metadata         json.RawMessage  `json:"metadata,omitempty"`
}
