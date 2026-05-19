package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type CampaignStatus string

const (
	CampaignStatusActive    CampaignStatus = "active"
	CampaignStatusPaused    CampaignStatus = "paused"
	CampaignStatusCompleted CampaignStatus = "completed"
	CampaignStatusArchived  CampaignStatus = "archived"
)

type Campaign struct {
	ID            uuid.UUID       `json:"id"`
	Name          string          `json:"name"`
	Description   *string         `json:"description,omitempty"`
	Status        CampaignStatus  `json:"status"`
	InputType     *string         `json:"input_type,omitempty"`
	Keywords      []string        `json:"keywords,omitempty"`
	SeedProfiles  []string        `json:"seed_profiles,omitempty"`
	AIQueries     []string        `json:"ai_queries,omitempty"`
	FollowerDepth int             `json:"follower_depth"`
	MaxResults    *int            `json:"max_results,omitempty"`
	UserID        *uuid.UUID      `json:"user_id,omitempty"`
	BudgetCents   int64           `json:"budget_cents"`
	SpendCents    int64           `json:"spend_cents"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
	Metadata      json.RawMessage `json:"metadata,omitempty"`
}
