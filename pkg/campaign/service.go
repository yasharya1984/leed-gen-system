package campaign

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lgs/queue-engine/pkg/models"
)

var ErrNotFound = errors.New("campaign not found")

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

type UpdateInput struct {
	Name        *string
	Description *string
	Status      *models.CampaignStatus
	MaxResults  *int
	BudgetCents *int64
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*models.Campaign, error) {
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

func (s *Service) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*models.Campaign, error) {
	var c models.Campaign
	err := s.db.QueryRow(ctx, `
		UPDATE campaigns SET
			name          = COALESCE($2, name),
			description   = COALESCE($3, description),
			status        = COALESCE($4, status),
			max_results   = COALESCE($5, max_results),
			budget_cents  = COALESCE($6, budget_cents),
			updated_at    = NOW()
		WHERE id = $1
		RETURNING id, name, description, status, input_type, keywords, seed_profiles,
		          ai_queries, follower_depth, max_results, user_id,
		          budget_cents, spend_cents, created_at, updated_at, metadata`,
		id, in.Name, in.Description, in.Status, in.MaxResults, in.BudgetCents,
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
	return &c, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM campaigns WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete campaign: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
