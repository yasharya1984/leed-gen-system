package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/lgs/queue-engine/pkg/campaign"
	"github.com/lgs/queue-engine/pkg/config"
	"github.com/lgs/queue-engine/pkg/db"
	"github.com/lgs/queue-engine/pkg/models"
	rdb "github.com/lgs/queue-engine/pkg/redis"
	"github.com/lgs/queue-engine/pkg/users"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := db.Connect(ctx, cfg.DB)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	redisClient, err := rdb.Connect(ctx, cfg.Redis)
	if err != nil {
		log.Fatalf("redis connect: %v", err)
	}
	defer redisClient.Close()

	userSvc := users.NewService(pool, cfg.JWT)
	campaignSvc := campaign.NewService(pool)

	mux := http.NewServeMux()
	registerRoutes(mux, userSvc, campaignSvc)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("api-gateway listening on :%d", cfg.Server.Port)
		if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

func registerRoutes(mux *http.ServeMux, userSvc *users.Service, campaignSvc *campaign.Service) {
	mux.HandleFunc("POST /api/v1/auth/register", handleRegister(userSvc))
	mux.HandleFunc("POST /api/v1/auth/login", handleLogin(userSvc))

	mux.HandleFunc("GET /api/v1/campaigns", authMiddleware(userSvc, handleListCampaigns(campaignSvc)))
	mux.HandleFunc("POST /api/v1/campaigns", authMiddleware(userSvc, handleCreateCampaign(campaignSvc)))
	mux.HandleFunc("GET /api/v1/campaigns/{id}", authMiddleware(userSvc, handleGetCampaign(campaignSvc)))
	mux.HandleFunc("PATCH /api/v1/campaigns/{id}", authMiddleware(userSvc, handleUpdateCampaign(campaignSvc)))
	mux.HandleFunc("DELETE /api/v1/campaigns/{id}", authMiddleware(userSvc, handleDeleteCampaign(campaignSvc)))

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
}

// --- Auth handlers ---

func handleRegister(svc *users.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Email    string          `json:"email"`
			Password string          `json:"password"`
			Name     string          `json:"name"`
			Role     models.UserRole `json:"role"`
		}
		if !decodeBody(w, r, &in) {
			return
		}
		u, err := svc.Create(r.Context(), users.CreateInput{
			Email:    in.Email,
			Password: in.Password,
			Name:     in.Name,
			Role:     in.Role,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusCreated, u)
	}
}

func handleLogin(svc *users.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if !decodeBody(w, r, &in) {
			return
		}
		u, token, err := svc.Authenticate(r.Context(), in.Email, in.Password)
		if errors.Is(err, users.ErrInvalidCredentials) || errors.Is(err, users.ErrInactiveAccount) {
			writeError(w, http.StatusUnauthorized, err)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"user": u, "token": token})
	}
}

// --- Campaign handlers ---

func handleListCampaigns(svc *campaign.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		campaigns, err := svc.ListByUser(r.Context(), userIDFromCtx(r), nil)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, campaigns)
	}
}

func handleCreateCampaign(svc *campaign.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Name          string   `json:"name"`
			Description   *string  `json:"description"`
			InputType     *string  `json:"input_type"`
			Keywords      []string `json:"keywords"`
			SeedProfiles  []string `json:"seed_profiles"`
			AIQueries     []string `json:"ai_queries"`
			FollowerDepth int      `json:"follower_depth"`
			MaxResults    *int     `json:"max_results"`
			BudgetCents   int64    `json:"budget_cents"`
		}
		if !decodeBody(w, r, &in) {
			return
		}
		uid := userIDFromCtx(r)
		c, err := svc.Create(r.Context(), campaign.CreateInput{
			Name:          in.Name,
			Description:   in.Description,
			InputType:     in.InputType,
			Keywords:      in.Keywords,
			SeedProfiles:  in.SeedProfiles,
			AIQueries:     in.AIQueries,
			FollowerDepth: in.FollowerDepth,
			MaxResults:    in.MaxResults,
			UserID:        &uid,
			BudgetCents:   in.BudgetCents,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusCreated, c)
	}
}

func handleGetCampaign(svc *campaign.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseUUID(w, r.PathValue("id"))
		if !ok {
			return
		}
		c, err := svc.GetByID(r.Context(), id)
		if errors.Is(err, campaign.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, c)
	}
}

func handleUpdateCampaign(svc *campaign.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseUUID(w, r.PathValue("id"))
		if !ok {
			return
		}
		var in campaign.UpdateInput
		if !decodeBody(w, r, &in) {
			return
		}
		c, err := svc.Update(r.Context(), id, in)
		if errors.Is(err, campaign.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, c)
	}
}

func handleDeleteCampaign(svc *campaign.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseUUID(w, r.PathValue("id"))
		if !ok {
			return
		}
		if err := svc.Delete(r.Context(), id); errors.Is(err, campaign.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// --- Middleware ---

type ctxKey string

const ctxUserID ctxKey = "user_id"

func authMiddleware(svc *users.Service, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		token, ok := strings.CutPrefix(auth, "Bearer ")
		if !ok || token == "" {
			writeError(w, http.StatusUnauthorized, errors.New("missing bearer token"))
			return
		}
		claims, err := svc.ValidateToken(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, errors.New("invalid token"))
			return
		}
		uid, err := uuid.Parse(claims.UserID)
		if err != nil {
			writeError(w, http.StatusUnauthorized, errors.New("invalid token claims"))
			return
		}
		ctx := context.WithValue(r.Context(), ctxUserID, uid)
		next(w, r.WithContext(ctx))
	}
}

func userIDFromCtx(r *http.Request) uuid.UUID {
	if id, ok := r.Context().Value(ctxUserID).(uuid.UUID); ok {
		return id
	}
	return uuid.Nil
}

// --- Helpers ---

func decodeBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid request body: %w", err))
		return false
	}
	return true
}

func parseUUID(w http.ResponseWriter, s string) (uuid.UUID, bool) {
	id, err := uuid.Parse(s)
	if err != nil {
		writeError(w, http.StatusBadRequest, errors.New("invalid id"))
		return uuid.Nil, false
	}
	return id, true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
