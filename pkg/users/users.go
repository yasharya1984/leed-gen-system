package users

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lgs/queue-engine/pkg/config"
	"github.com/lgs/queue-engine/pkg/models"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrNotFound           = errors.New("user not found")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInactiveAccount    = errors.New("account is inactive")
)

type Service struct {
	db  *pgxpool.Pool
	jwt config.JWTConfig
}

func NewService(db *pgxpool.Pool, jwtCfg config.JWTConfig) *Service {
	return &Service{db: db, jwt: jwtCfg}
}

type CreateInput struct {
	Email    string
	Password string
	Name     string
	Role     models.UserRole
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*models.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	role := in.Role
	if role == "" {
		role = models.UserRoleUser
	}

	var u models.User
	err = s.db.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, name, role)
		VALUES ($1, $2, $3, $4)
		RETURNING id, email, password_hash, name, role, is_active, last_login_at, created_at, updated_at`,
		in.Email, string(hash), in.Name, role,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Role,
		&u.IsActive, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return &u, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	var u models.User
	err := s.db.QueryRow(ctx, `
		SELECT id, email, password_hash, name, role, is_active, last_login_at, created_at, updated_at
		FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Role,
		&u.IsActive, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	return &u, nil
}

func (s *Service) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := s.db.QueryRow(ctx, `
		SELECT id, email, password_hash, name, role, is_active, last_login_at, created_at, updated_at
		FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Role,
		&u.IsActive, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return &u, nil
}

// Authenticate validates credentials and returns the user + a signed JWT.
func (s *Service) Authenticate(ctx context.Context, email, password string) (*models.User, string, error) {
	u, err := s.GetByEmail(ctx, email)
	if err != nil {
		return nil, "", ErrInvalidCredentials
	}
	if !u.IsActive {
		return nil, "", ErrInactiveAccount
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, "", ErrInvalidCredentials
	}

	_, _ = s.db.Exec(ctx, `UPDATE users SET last_login_at = NOW() WHERE id = $1`, u.ID)

	token, err := s.signToken(u)
	if err != nil {
		return nil, "", fmt.Errorf("sign token: %w", err)
	}
	return u, token, nil
}

func (s *Service) UpdatePassword(ctx context.Context, id uuid.UUID, current, next string) error {
	u, err := s.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(current)); err != nil {
		return ErrInvalidCredentials
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(next), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	_, err = s.db.Exec(ctx,
		`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
		id, string(hash),
	)
	return err
}

// --- JWT ---

type Claims struct {
	UserID string          `json:"uid"`
	Role   models.UserRole `json:"role"`
	jwt.RegisteredClaims
}

func (s *Service) signToken(u *models.User) (string, error) {
	expiry := time.Now().Add(time.Duration(s.jwt.ExpiryHours) * time.Hour)
	c := Claims{
		UserID: u.ID.String(),
		Role:   u.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   u.ID.String(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expiry),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString([]byte(s.jwt.Secret))
}

func (s *Service) ValidateToken(raw string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(s.jwt.Secret), nil
	})
	if err != nil {
		return nil, err
	}
	if c, ok := token.Claims.(*Claims); ok && token.Valid {
		return c, nil
	}
	return nil, errors.New("invalid token")
}
