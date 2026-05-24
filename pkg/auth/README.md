# pkg/auth

Reusable JWT authentication middleware for the LGS API gateway. Decoupled from the `users` package via the `Validator` interface so it can be tested or swapped independently.

## Responsibilities

- Extracts the `Authorization: Bearer <token>` header
- Validates the JWT (signature, expiry, algorithm)
- Injects authenticated `uuid.UUID` and `models.UserRole` into the request context
- Returns **403 Forbidden** (never 401) for missing, expired, or invalid tokens

## API

### `auth.Middleware(v Validator)`

Returns a `func(http.HandlerFunc) http.HandlerFunc` that wraps any handler.

```go
protect := auth.Middleware(userSvc)
mux.HandleFunc("GET /api/v1/campaigns", protect(handleListCampaigns(campaignSvc)))
```

### `auth.RequireRole(v Validator, role models.UserRole)`

Builds on `Middleware` and additionally enforces a minimum role. Role hierarchy: `viewer < user < admin`.

```go
adminOnly := auth.RequireRole(userSvc, models.UserRoleAdmin)
mux.HandleFunc("DELETE /api/v1/admin/users/{id}", adminOnly(handleDeleteUser))
```

### `auth.UserID(r *http.Request) uuid.UUID`

Reads the authenticated UUID from the request context. Returns `uuid.Nil` if called outside a middleware-protected handler.

### `auth.Role(r *http.Request) models.UserRole`

Reads the authenticated role from the request context.

## The Validator Interface

```go
type Validator interface {
    ValidateToken(raw string) (*users.Claims, error)
}
```

`*users.Service` satisfies this interface. For tests, stub it with any struct that implements the single method.

## Configuration

Token lifetime is controlled by the `JWT_EXPIRY_HOURS` environment variable loaded in `pkg/config`:

```bash
JWT_EXPIRY_HOURS=24    # default — tokens valid for 24 hours
JWT_EXPIRY_HOURS=1     # short-lived tokens for high-security contexts
JWT_EXPIRY_HOURS=168   # 7-day sessions
```

The HMAC-SHA256 signing secret is read from `JWT_SECRET`. **Always set a strong secret in production.** The default `"change-me-in-production"` is intentionally weak.

## Error Contract

All auth failures return `403 Forbidden` with a JSON body:

```json
{ "error": "invalid or expired token" }
```

Possible messages:
- `"missing authorization token"` — no `Authorization` header or not a Bearer token
- `"invalid or expired token"` — JWT expired, bad signature, or wrong algorithm
- `"malformed token claims"` — `uid` claim could not be parsed as a UUID
- `"insufficient permissions"` — `RequireRole` check failed

## Internal Flow

```
Request
  ↓
extractBearer(r)        → 403 if missing
  ↓
v.ValidateToken(raw)    → 403 if expired / bad sig / wrong alg
  ↓
uuid.Parse(claims.UserID) → 403 if malformed
  ↓
context.WithValue × 2   (keyUserID, keyRole)
  ↓
next(w, r.WithContext(ctx))
```
