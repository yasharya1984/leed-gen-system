# pkg/campaign

PostgreSQL-backed service for managing lead generation campaigns. All write operations are scoped by `user_id` for multi-tenant ownership isolation, and state mutations are logged to the `audit_logs` table.

## Service API

```go
svc := campaign.NewService(pool)
```

| Method | Signature | Notes |
|--------|-----------|-------|
| `Create` | `(ctx, CreateInput) (*Campaign, error)` | Validates name; writes `campaign_created` audit entry |
| `GetByID` | `(ctx, id) (*Campaign, error)` | No ownership check — use `GetByIDForUser` from handlers |
| `GetByIDForUser` | `(ctx, id, userID) (*Campaign, error)` | Returns `ErrNotFound` if campaign belongs to another user |
| `ListByUser` | `(ctx, userID, *status) ([]*Campaign, error)` | Optional status filter |
| `Update` | `(ctx, id, userID, UpdateInput) (*Campaign, error)` | Partial update; enforces ownership in SQL; writes `campaign_updated` audit |
| `SetStatus` | `(ctx, id, userID, CampaignStatus) (*Campaign, error)` | Validates enum; writes `campaign_paused` or `campaign_updated` audit |
| `Delete` | `(ctx, id, userID) error` | Enforces ownership in SQL |

## Campaign Status Lifecycle

Valid statuses (match the `campaigns.status` CHECK constraint in Postgres):

```
active ←→ paused
  ↓         ↓
completed   archived
```

Use `SetStatus` for explicit lifecycle transitions — it writes the correct `audit_logs.event_type` based on the target status:

| Target status | audit_logs event_type |
|---------------|-----------------------|
| `paused` | `campaign_paused` |
| any other | `campaign_updated` |

## Error Sentinels

```go
campaign.ErrNotFound     // HTTP 404 — campaign missing or not owned by caller
campaign.ErrInvalidInput // HTTP 400 — empty name, invalid status value, etc.
```

## Input Types

`CreateInput.UpdateInput` use JSON tags for direct HTTP body decoding:

```go
type UpdateInput struct {
    Name        *string                `json:"name"`
    Description *string                `json:"description"`
    Status      *models.CampaignStatus `json:"status"`
    MaxResults  *int                   `json:"max_results"`
    BudgetCents *int64                 `json:"budget_cents"`
}
```

All pointer fields are optional — `COALESCE($n, existing_col)` in SQL means only non-nil fields are updated.

## Ownership Enforcement

Every mutating method (`Update`, `Delete`, `SetStatus`, `GetByIDForUser`) appends `AND user_id = $n` to the `WHERE` clause. A campaign that exists but belongs to a different user is indistinguishable from a missing campaign — both return `ErrNotFound` — preventing ID-enumeration attacks.

## Audit Logging

`logAudit` inserts into `audit_logs` after each successful mutation. Errors are intentionally swallowed so an audit failure never aborts the main operation.

Fields written: `campaign_id`, `event_type`, `actor` (user UUID string), `old_values`, `new_values`, `change_summary`.

## Schema Reference

The underlying `campaigns` table (defined in `services/postgres/init-scripts/01_core_schema.sql`):

```sql
id UUID, name VARCHAR(255), description TEXT,
status VARCHAR(50) CHECK (status IN ('active','paused','completed','archived')),
input_type VARCHAR(50), keywords TEXT[], seed_profiles TEXT[], ai_queries TEXT[],
follower_depth INTEGER, max_results INTEGER, user_id UUID,
budget_cents BIGINT, spend_cents BIGINT,
created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, metadata JSONB
```

`updated_at` is maintained automatically by the `tr_campaigns_update_timestamp` trigger.
