package campaign

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lgs/queue-engine/pkg/models"
)

var (
	ErrNotFound     = errors.New("campaign not found")
	ErrInvalidInput = errors.New("invalid input")
)

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

type CreateInput struct {
	Name          string
	Description   *string
	InputType     *string
	Keywords      []string
	SeedProfiles  []string
	AIQueries     []string
	FollowerDepth int
	MaxResults    *int
	UserID        *uuid.UUID
	BudgetCents   int64
}

// UpdateInput uses snake_case JSON tags so the HTTP handler can decode request bodies directly.
type UpdateInput struct {
	Name        *string                `json:"name"`
	Description *string                `json:"description"`
	Status      *models.CampaignStatus `json:"status"`
	MaxResults  *int                   `json:"max_results"`
	BudgetCents *int64                 `json:"budget_cents"`
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*models.Campaign, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidInput)
	}

	depth := in.FollowerDepth
	if depth == 0 {
		depth = 1
	}

	var c models.Campaign
	err := s.db.QueryRow(ctx, `
		INSERT INTO campaigns
			(name, description, input_type, keywords, seed_profiles, ai_queries,
			 follower_depth, max_results, user_id, budget_cents)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id, name, description, status, input_type, keywords, seed_profiles,
		          ai_queries, follower_depth, max_results, user_id,
		          budget_cents, spend_cents, created_at, updated_at, metadata`,
		in.Name, in.Description, in.InputType, in.Keywords, in.SeedProfiles,
		in.AIQueries, depth, in.MaxResults, in.UserID, in.BudgetCents,
	).Scan(
		&c.ID, &c.Name, &c.Description, &c.Status, &c.InputType,
		&c.Keywords, &c.SeedProfiles, &c.AIQueries, &c.FollowerDepth,
		&c.MaxResults, &c.UserID, &c.BudgetCents, &c.SpendCents,
		&c.CreatedAt, &c.UpdatedAt, &c.Metadata,
	)
	if err != nil {
		return nil, fmt.Errorf("create campaign: %w", err)
	}

	actor := ""
	if in.UserID != nil {
		actor = in.UserID.String()
	}
	s.logAudit(ctx, c.ID, "campaign_created", actor, nil, map[string]any{
		"name":   c.Name,
		"status": c.Status,
	}, "campaign created")

	return &c, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*models.Campaign, error) {
	var c models.Campaign
	err := s.db.QueryRow(ctx, `
		SELECT id, name, description, status, input_type, keywords, seed_profiles,
		       ai_queries, follower_depth, max_results, user_id,
		       budget_cents, spend_cents, created_at, updated_at, metadata
		FROM campaigns WHERE id = $1`, id,
	).Scan(
		&c.ID, &c.Name, &c.Description, &c.Status, &c.InputType,
		&c.Keywords, &c.SeedProfiles, &c.AIQueries, &c.FollowerDepth,
		&c.MaxResults, &c.UserID, &c.BudgetCents, &c.SpendCents,
		&c.CreatedAt, &c.UpdatedAt, &c.Metadata,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get campaign: %w", err)
	}
	return &c, nil
}

func (s *Service) ListByUser(ctx context.Context, userID uuid.UUID, status *models.CampaignStatus) ([]*models.Campaign, error) {
	query := `
		SELECT id, name, description, status, input_type, keywords, seed_profiles,
		       ai_queries, follower_depth, max_results, user_id,
		       budget_cents, spend_cents, created_at, updated_at, metadata
		FROM campaigns WHERE user_id = $1`
	args := []any{userID}

	if status != nil {
		query += " AND status = $2"
		args = append(args, *status)
	}
	query += " ORDER BY created_at DESC"

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list campaigns: %w", err)
	}
	defer rows.Close()

	var campaigns []*models.Campaign
	for rows.Next() {
		var c models.Campaign
		if err := rows.Scan(
			&c.ID, &c.Name, &c.Description, &c.Status, &c.InputType,
			&c.Keywords, &c.SeedProfiles, &c.AIQueries, &c.FollowerDepth,
			&c.MaxResults, &c.UserID, &c.BudgetCents, &c.SpendCents,
			&c.CreatedAt, &c.UpdatedAt, &c.Metadata,
		); err != nil {
			return nil, fmt.Errorf("scan campaign: %w", err)
		}
		campaigns = append(campaigns, &c)
	}
	return campaigns, rows.Err()
}

// GetByIDForUser fetches a campaign only if it belongs to the given user.
// Returns ErrNotFound if the campaign does not exist or is owned by someone else.
func (s *Service) GetByIDForUser(ctx context.Context, id, userID uuid.UUID) (*models.Campaign, error) {
	var c models.Campaign
	err := s.db.QueryRow(ctx, `
		SELECT id, name, description, status, input_type, keywords, seed_profiles,
		       ai_queries, follower_depth, max_results, user_id,
		       budget_cents, spend_cents, created_at, updated_at, metadata
		FROM campaigns WHERE id = $1 AND user_id = $2`, id, userID,
	).Scan(
		&c.ID, &c.Name, &c.Description, &c.Status, &c.InputType,
		&c.Keywords, &c.SeedProfiles, &c.AIQueries, &c.FollowerDepth,
		&c.MaxResults, &c.UserID, &c.BudgetCents, &c.SpendCents,
		&c.CreatedAt, &c.UpdatedAt, &c.Metadata,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get campaign: %w", err)
	}
	return &c, nil
}

// Update applies a partial update to a campaign. Only the calling user's campaigns
// may be modified; campaigns owned by other users return ErrNotFound.
func (s *Service) Update(ctx context.Context, id, userID uuid.UUID, in UpdateInput) (*models.Campaign, error) {
	var c models.Campaign
	err := s.db.QueryRow(ctx, `
		UPDATE campaigns SET
			name          = COALESCE($3, name),
			description   = COALESCE($4, description),
			status        = COALESCE($5, status),
			max_results   = COALESCE($6, max_results),
			budget_cents  = COALESCE($7, budget_cents),
			updated_at    = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, name, description, status, input_type, keywords, seed_profiles,
		          ai_queries, follower_depth, max_results, user_id,
		          budget_cents, spend_cents, created_at, updated_at, metadata`,
		id, userID, in.Name, in.Description, in.Status, in.MaxResults, in.BudgetCents,
	).Scan(
		&c.ID, &c.Name, &c.Description, &c.Status, &c.InputType,
		&c.Keywords, &c.SeedProfiles, &c.AIQueries, &c.FollowerDepth,
		&c.MaxResults, &c.UserID, &c.BudgetCents, &c.SpendCents,
		&c.CreatedAt, &c.UpdatedAt, &c.Metadata,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update campaign: %w", err)
	}

	s.logAudit(ctx, c.ID, "campaign_updated", userID.String(), nil, map[string]any{
		"name":         c.Name,
		"status":       c.Status,
		"budget_cents": c.BudgetCents,
	}, "campaign updated")

	return &c, nil
}

// Delete removes a campaign owned by userID. Returns ErrNotFound if the campaign
// does not exist or belongs to another user.
func (s *Service) Delete(ctx context.Context, id, userID uuid.UUID) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM campaigns WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("delete campaign: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetStatus explicitly transitions a campaign's status and writes an audit log entry.
// Valid statuses are active, paused, completed, and archived.
func (s *Service) SetStatus(ctx context.Context, id, userID uuid.UUID, newStatus models.CampaignStatus) (*models.Campaign, error) {
	switch newStatus {
	case models.CampaignStatusActive, models.CampaignStatusPaused,
		models.CampaignStatusCompleted, models.CampaignStatusArchived:
	default:
		return nil, fmt.Errorf("%w: status must be one of active, paused, completed, archived", ErrInvalidInput)
	}

	var c models.Campaign
	err := s.db.QueryRow(ctx, `
		UPDATE campaigns SET status = $3, updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, name, description, status, input_type, keywords, seed_profiles,
		          ai_queries, follower_depth, max_results, user_id,
		          budget_cents, spend_cents, created_at, updated_at, metadata`,
		id, userID, newStatus,
	).Scan(
		&c.ID, &c.Name, &c.Description, &c.Status, &c.InputType,
		&c.Keywords, &c.SeedProfiles, &c.AIQueries, &c.FollowerDepth,
		&c.MaxResults, &c.UserID, &c.BudgetCents, &c.SpendCents,
		&c.CreatedAt, &c.UpdatedAt, &c.Metadata,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("set campaign status: %w", err)
	}

	eventType := "campaign_updated"
	if newStatus == models.CampaignStatusPaused {
		eventType = "campaign_paused"
	}
	s.logAudit(ctx, c.ID, eventType, userID.String(), nil,
		map[string]any{"status": newStatus},
		fmt.Sprintf("status set to %s", newStatus))

	return &c, nil
}

// logAudit writes a row to audit_logs. Failures are intentionally swallowed so
// audit errors never abort the caller's main operation.
func (s *Service) logAudit(ctx context.Context, campaignID uuid.UUID, eventType, actor string, oldVals, newVals map[string]any, summary string) {
	old, _ := json.Marshal(oldVals)
	nw, _ := json.Marshal(newVals)
	_, _ = s.db.Exec(ctx, `
		INSERT INTO audit_logs (campaign_id, event_type, actor, old_values, new_values, change_summary)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		campaignID, eventType, actor, old, nw, summary)
}
