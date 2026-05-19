-- 1. Create Custom Enum Types for Explicit State Control
CREATE TYPE user_subscription_status AS ENUM ('not_subscribed', 'subscribed', 'expired');
CREATE TYPE billing_interval AS ENUM ('monthly', 'yearly', 'lifetime');

-- 2. Subscription Plans Table (The Tiers & Limits)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,                       -- e.g., 'Starter', 'Growth', 'Enterprise'
    price_in_cents INT NOT NULL DEFAULT 0,                  -- Stored in cents to avoid floating-point math issues
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    interval billing_interval NOT NULL DEFAULT 'monthly',
    
    -- Strict Boundary Limits (Mapped to your requirements)
    max_campaigns INT NOT NULL,                             -- Max number of allowed concurrent/total campaigns
    max_leads_per_campaign INT NOT NULL,                    -- Target number of allowed user data to fetch per campaign
    max_leads_total INT NOT NULL,                           -- Cumulative max allowed leads across all campaigns
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Users Table (Core Accounts)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,                    -- For secure authentication hashing storage
    full_name VARCHAR(100),
    status user_subscription_status NOT NULL DEFAULT 'not_subscribed',
    
    -- Active Plan References
    current_plan_id INT REFERENCES subscription_plans(id) ON DELETE SET NULL,
    plan_expires_at TIMESTAMP WITH TIME ZONE,               -- Dynamic evaluation point for the 'expired' state
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Highly Granular Indexes for Fast API-Gateway Verification Lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_plan_expiry ON users(plan_expires_at) WHERE status = 'subscribed';

-- 5. Link Existing 'campaigns' Table to Users (Multi-Tenancy)
-- Run this if your campaigns table doesn't have a user ownership link yet:
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
