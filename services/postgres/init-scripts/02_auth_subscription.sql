-- ============================================================================
-- Script 02: Subscription layer
--
-- Depends on: 01_core_schema.sql (users table must already exist)
--
-- Adds:
--   - subscription_plans table
--   - subscription columns onto the existing users table
-- ============================================================================

-- Custom enum types (safe to re-run via IF NOT EXISTS guard on types)
DO $$ BEGIN
    CREATE TYPE user_subscription_status AS ENUM ('not_subscribed', 'subscribed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE billing_interval AS ENUM ('monthly', 'yearly', 'lifetime');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Subscription plans catalogue
CREATE TABLE IF NOT EXISTS subscription_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    price_in_cents INT NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    interval billing_interval NOT NULL DEFAULT 'monthly',
    max_campaigns INT NOT NULL,
    max_leads_per_campaign INT NOT NULL,
    max_leads_total INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Extend users (created by 01_core_schema.sql) with subscription fields.
-- All additions are idempotent.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS subscription_status user_subscription_status NOT NULL DEFAULT 'not_subscribed',
    ADD COLUMN IF NOT EXISTS current_plan_id INT REFERENCES subscription_plans(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_plan_expiry ON users(plan_expires_at) WHERE subscription_status = 'subscribed';
