// Package auth provides JWT-based authentication middleware and context helpers
// for the LGS API gateway. It is decoupled from the users package via the
// Validator interface so it can be tested or swapped independently.
package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/lgs/queue-engine/pkg/models"
	"github.com/lgs/queue-engine/pkg/users"
)

// Validator is satisfied by *users.Service. It is defined here so callers only
// depend on the interface, not the concrete service.
type Validator interface {
	ValidateToken(raw string) (*users.Claims, error)
}

type ctxKey string

const (
	keyUserID ctxKey = "auth_user_id"
	keyRole   ctxKey = "auth_role"
)

// Middleware returns a handler wrapper that enforces Bearer token authentication.
//
// On success it injects the authenticated user's UUID and role into the request
// context, which downstream handlers retrieve with UserID and Role.
//
// Any request with a missing, expired, or cryptographically invalid token is
// rejected immediately with 403 Forbidden — never 401 — per the API contract.
func Middleware(v Validator) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			raw, ok := extractBearer(r)
			if !ok {
				writeErr(w, "missing authorization token")
				return
			}

			claims, err := v.ValidateToken(raw)
			if err != nil {
				// jwt library returns errors for expired tokens too, so this
				// branch covers expiry, bad signature, wrong algorithm, etc.
				writeErr(w, "invalid or expired token")
				return
			}

			uid, err := uuid.Parse(claims.UserID)
			if err != nil {
				writeErr(w, "malformed token claims")
				return
			}

			ctx := context.WithValue(r.Context(), keyUserID, uid)
			ctx = context.WithValue(ctx, keyRole, claims.Role)
			next(w, r.WithContext(ctx))
		}
	}
}

// UserID returns the authenticated user's UUID injected by Middleware.
// Returns uuid.Nil when called outside an authenticated request context.
func UserID(r *http.Request) uuid.UUID {
	if id, ok := r.Context().Value(keyUserID).(uuid.UUID); ok {
		return id
	}
	return uuid.Nil
}

// Role returns the authenticated user's role injected by Middleware.
// Returns an empty string when called outside an authenticated request context.
func Role(r *http.Request) models.UserRole {
	if role, ok := r.Context().Value(keyRole).(models.UserRole); ok {
		return role
	}
	return ""
}

// RequireRole wraps Middleware and additionally enforces that the caller holds
// at least the given role. Handlers that need admin-only access use this instead
// of the plain Middleware.
//
// Role hierarchy: admin > user > viewer.
func RequireRole(v Validator, required models.UserRole) func(http.HandlerFunc) http.HandlerFunc {
	base := Middleware(v)
	return func(next http.HandlerFunc) http.HandlerFunc {
		return base(func(w http.ResponseWriter, r *http.Request) {
			if !roleAtLeast(Role(r), required) {
				writeErr(w, "insufficient permissions")
				return
			}
			next(w, r)
		})
	}
}

// roleAtLeast returns true when have is equal to or more privileged than need.
func roleAtLeast(have, need models.UserRole) bool {
	rank := map[models.UserRole]int{
		models.UserRoleViewer: 1,
		models.UserRoleUser:   2,
		models.UserRoleAdmin:  3,
	}
	return rank[have] >= rank[need]
}

func extractBearer(r *http.Request) (string, bool) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	return token, ok && token != ""
}

func writeErr(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
