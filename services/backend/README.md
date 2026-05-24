# services/api-gateway

HTTP API gateway for the Lead Generation System. Handles user authentication, JWT issuance, and all campaign CRUD operations. Written in Go using the standard `net/http` mux (Go 1.22+ method+path patterns).

## Running Locally

```bash
# From repo root
go run ./services/api-gateway

# Or via Makefile
make run-api-gateway
```

Default port: **8080**. Override with `SERVER_PORT=9090`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8080` | HTTP listen port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `lgs_core` | Database name |
| `DB_USER` | `lgs_user` | Database user |
| `DB_PASSWORD` | `lgs_secure_password_change_me` | **Change in production** |
| `DB_SSLMODE` | `disable` | `require` in production |
| `REDIS_ADDR` | `localhost:6379` | Redis address |
| `JWT_SECRET` | `change-me-in-production` | HMAC-SHA256 signing key — **change in production** |
| `JWT_EXPIRY_HOURS` | `24` | Token lifetime in hours |

## Endpoints

### Auth (public)

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/v1/auth/register` | `{email, password, name, role?}` | `201 User` |
| `POST` | `/api/v1/auth/login` | `{email, password}` | `200 {user, token}` |

### Campaigns (require `Authorization: Bearer <token>`)

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/v1/campaigns` | — | `200 Campaign[]` |
| `GET` | `/api/v1/campaigns?status=active` | — | `200 Campaign[]` filtered |
| `POST` | `/api/v1/campaigns` | `CreateCampaignInput` | `201 Campaign` |
| `GET` | `/api/v1/campaigns/{id}` | — | `200 Campaign` |
| `PATCH` | `/api/v1/campaigns/{id}` | `UpdateCampaignInput` | `200 Campaign` |
| `PATCH` | `/api/v1/campaigns/{id}/status` | `{status}` | `200 Campaign` |
| `DELETE` | `/api/v1/campaigns/{id}` | — | `204 No Content` |

### Health

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/health` | `200 {"status":"ok"}` |

## Request / Response Format

All bodies are `application/json`. Errors follow the shape:

```json
{ "error": "human-readable message" }
```

### CreateCampaignInput

```json
{
  "name": "SaaS Founders Q3",
  "description": "optional",
  "input_type": "keywords",
  "keywords": ["saas", "founder"],
  "seed_profiles": [],
  "ai_queries": [],
  "follower_depth": 1,
  "max_results": 500,
  "budget_cents": 50000
}
```

### SetStatus body

```json
{ "status": "paused" }
```

Valid values: `active` | `paused` | `completed` | `archived`

## Authentication & Security

- Tokens are **HMAC-SHA256** signed JWTs (via `github.com/golang-jwt/jwt/v5`)
- All campaign routes use `auth.Middleware(userSvc)` from `pkg/auth`
- Invalid / expired / missing tokens return **403 Forbidden**
- Campaign routes enforce ownership: a campaign owned by user A is invisible to user B (returns 404)

## Middleware Chain

```
Request
  └─ auth.Middleware
       └─ extract Bearer token
       └─ validate JWT (exp, sig, alg)
       └─ inject uuid.UUID + UserRole into context
       └─ handler(w, r)
```

## Architecture

```
main.go
 ├── db.Connect()        → *pgxpool.Pool
 ├── redis.Connect()     → *goredis.Client
 ├── users.NewService()  → *users.Service  (auth + JWT)
 ├── campaign.NewService() → *campaign.Service
 └── registerRoutes()
      ├── POST /auth/register  → handleRegister
      ├── POST /auth/login     → handleLogin
      └── /campaigns/*         → auth.Middleware(userSvc) → campaign handlers
```
