package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Profile struct {
	ID                 uuid.UUID       `json:"id"`
	Platform           string          `json:"platform"`
	CampaignID         uuid.UUID       `json:"campaign_id"`
	FirstName          *string         `json:"first_name,omitempty"`
	LastName           *string         `json:"last_name,omitempty"`
	Username           string          `json:"username"`
	DisplayName        *string         `json:"display_name,omitempty"`
	Bio                *string         `json:"bio,omitempty"`
	Email              *string         `json:"email,omitempty"`
	PhoneE164          *string         `json:"phone_e164,omitempty"`
	CompanyName        *string         `json:"company_name,omitempty"`
	JobTitle           *string         `json:"job_title,omitempty"`
	WebsiteURL         *string         `json:"website_url,omitempty"`
	LinkedInProfileURL *string         `json:"linkedin_profile_url,omitempty"`
	FollowerCount      *int            `json:"follower_count,omitempty"`
	FollowingCount     *int            `json:"following_count,omitempty"`
	PostCount          *int            `json:"post_count,omitempty"`
	IsVerified         bool            `json:"is_verified"`
	IsBusiness         bool            `json:"is_business"`
	Category           *string         `json:"category,omitempty"`
	Location           *string         `json:"location,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
	UpdatedAt          time.Time       `json:"updated_at"`
	Metadata           json.RawMessage `json:"metadata,omitempty"`
}
