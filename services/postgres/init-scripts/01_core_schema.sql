-- ============================================================================
-- Lead Generation System (LGS) - PostgreSQL 15+ DDL Schema
-- ============================================================================
-- Purpose: Foundational schema with deduplication guarantees and optimized
--          B-Tree indexing for <50ms p95 lookup latencies.
-- ============================================================================

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================================
-- TABLE: users
-- Stores authenticated user accounts that own campaigns
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email CITEXT NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user'
        CHECK (role IN ('admin', 'user', 'viewer')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================================
-- TABLE: campaigns
-- Stores lead generation campaign metadata and configuration
-- ============================================================================
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    input_type VARCHAR(50),
    keywords TEXT[],
    seed_profiles TEXT[],
    ai_queries TEXT[],
    follower_depth INTEGER DEFAULT 1,
    max_results INTEGER,
    user_id UUID,
    budget_cents BIGINT DEFAULT 0,
    spend_cents BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at DESC);
CREATE INDEX idx_campaigns_user ON campaigns(user_id);

-- ============================================================================
-- TABLE: profiles
-- Stores prospect/lead profile information with normalized contact data
-- ============================================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform VARCHAR(50) NOT NULL,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

    first_name VARCHAR(100),
    last_name VARCHAR(100),
    username VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    bio TEXT,
 
    email CITEXT UNIQUE,
    -- E.164 normalized phone number (e.g., +1 prefix, no spaces/dashes)
    phone_e164 VARCHAR(20) UNIQUE,
    company_name VARCHAR(255),
    job_title VARCHAR(255),
    website_url VARCHAR(500),
    linkedin_profile_url VARCHAR(500),
    follower_count INTEGER,
    following_count INTEGER,
    post_count INTEGER,
    is_verified BOOLEAN DEFAULT FALSE,
    is_business BOOLEAN DEFAULT FALSE,
    category VARCHAR(100),

    location VARCHAR(255),
    UNIQUE(platform, username),

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_profiles_campaign_id ON profiles(campaign_id);
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_phone_e164 ON profiles(phone_e164);
CREATE INDEX idx_profiles_created_at ON profiles(created_at DESC);
CREATE INDEX idx_profiles_platform ON profiles(platform);
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_location ON profiles(location);

-- ============================================================================
-- TABLE: leads
-- Central lead repository with composite deduplication on email + phone
-- Tracks enrichment state, validation status, and lead quality signals
-- ============================================================================
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Normalized contact: guarantee deduplication via composite unique constraint
    email CITEXT,
    phone_e164 VARCHAR(20),
    email_type VARCHAR(50),
    phone_type VARCHAR(50),
    confidence_score INTEGER CHECK (confidence_score BETWEEN 0 AND 100),
    source_type VARCHAR(50),

    -- Deduplication constraint: at least one contact method must be present
    CONSTRAINT chk_lead_contact_present
        CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL),

    -- Validation and enrichment pipeline state
    validation_status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (validation_status IN ('pending', 'valid', 'invalid', 'bounced')),
    enrichment_status VARCHAR(50) NOT NULL DEFAULT 'unenriched'
        CHECK (enrichment_status IN ('unenriched', 'enriching', 'enriched', 'failed')),
    
    -- Pipeline stage tracking
    stage VARCHAR(50) NOT NULL DEFAULT 'raw'
        CHECK (stage IN ('raw', 'validated', 'enriched', 'contacted', 'qualified')),
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::JSONB
);

-- Composite unique constraint for deduplication at database layer
-- Ensures no duplicate leads per campaign by normalized contact info
CREATE UNIQUE INDEX idx_leads_dedup 
    ON leads(campaign_id, COALESCE(email, 'NULL'), COALESCE(phone_e164, 'NULL'))
    WHERE email IS NOT NULL OR phone_e164 IS NOT NULL;

-- B-Tree indexes targeting p95 < 50ms lookup boundaries
CREATE INDEX idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX idx_leads_profile_id ON leads(profile_id);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_phone_e164 ON leads(phone_e164);
CREATE INDEX idx_leads_validation_status ON leads(validation_status);
CREATE INDEX idx_leads_enrichment_status ON leads(enrichment_status);
CREATE INDEX idx_leads_stage ON leads(stage);
CREATE INDEX idx_leads_confidence_score ON leads(confidence_score DESC);

-- Composite indexes for common query patterns
CREATE INDEX idx_leads_campaign_validation 
    ON leads(campaign_id, validation_status);
CREATE INDEX idx_leads_campaign_stage 
    ON leads(campaign_id, stage);
CREATE INDEX idx_leads_campaign_enrichment 
    ON leads(campaign_id, enrichment_status);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

-- ============================================================================
-- TABLE: relationships
-- Tracks associations between leads, profiles, and external entities
-- Supports many-to-many mappings for flexible lead clustering
-- ============================================================================
CREATE TABLE relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    relationship_type VARCHAR(100) NOT NULL
        CHECK (relationship_type IN ('belongs_to', 'similar_to', 'clustered_with', 'related_to')),
    confidence NUMERIC(3,2) DEFAULT 1.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_relationships_lead_id ON relationships(lead_id);
CREATE INDEX idx_relationships_profile_id ON relationships(profile_id);
CREATE INDEX idx_relationships_type ON relationships(relationship_type);
CREATE INDEX idx_relationships_confidence ON relationships(confidence DESC);

-- ============================================================================
-- TABLE: audit_logs
-- Immutable audit trail for compliance, debugging, and forensics
-- Tracks all state mutations with full context
-- ============================================================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    
    -- Mutation tracking
    event_type VARCHAR(100) NOT NULL
        CHECK (event_type IN (
            'lead_created', 'lead_updated', 'lead_validated', 'lead_enriched',
            'campaign_created', 'campaign_updated', 'campaign_paused',
            'profile_created', 'profile_updated',
            'relationship_created', 'relationship_deleted',
            'system_error', 'system_migration', 'manual_action'
        )),
    
    -- Context and state
    actor VARCHAR(255),
    old_values JSONB DEFAULT '{}'::JSONB,
    new_values JSONB DEFAULT '{}'::JSONB,
    change_summary TEXT,
    
    -- Performance and debugging
    execution_time_ms INTEGER DEFAULT 0,
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for audit trail queries and retention policies
CREATE INDEX idx_audit_logs_campaign_id ON audit_logs(campaign_id);
CREATE INDEX idx_audit_logs_lead_id ON audit_logs(lead_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor);

-- ============================================================================
-- CONSTRAINTS & VIEWS
-- ============================================================================

-- Required for FK referencing composite (campaign_id, id) on profiles
CREATE UNIQUE INDEX idx_profiles_campaign_id_id ON profiles(campaign_id, id);

-- Ensure leads.campaign_id matches profiles.campaign_id for consistency
ALTER TABLE leads
    ADD CONSTRAINT fk_leads_profile_campaign
    FOREIGN KEY (campaign_id, profile_id)
    REFERENCES profiles(campaign_id, id);

-- View: Active leads requiring validation
CREATE OR REPLACE VIEW v_pending_validation AS
    SELECT 
        l.id,
        l.campaign_id,
        l.profile_id,
        l.email,
        l.phone_e164,
        l.confidence_score,
        l.created_at
    FROM leads l
    WHERE l.validation_status = 'pending'
        AND l.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY l.confidence_score DESC, l.created_at ASC;

-- View: Leads ready for enrichment
CREATE OR REPLACE VIEW v_ready_for_enrichment AS
    SELECT 
        l.id,
        l.campaign_id,
        l.profile_id,
        l.email,
        l.phone_e164,
        l.validation_status,
        l.created_at
    FROM leads l
    WHERE l.validation_status = 'valid'
        AND l.enrichment_status = 'unenriched'
    ORDER BY l.created_at ASC;

-- ============================================================================
-- ANALYTICS & PERFORMANCE TRIGGERS
-- ============================================================================

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_update_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- FK: campaigns -> users (optional, user_id may be null for system campaigns)
ALTER TABLE campaigns
    ADD CONSTRAINT fk_campaigns_user_id
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TRIGGER tr_campaigns_update_timestamp
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER tr_profiles_update_timestamp
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER tr_leads_update_timestamp
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- VACUUMING & MAINTENANCE HINTS
-- ============================================================================
-- Note: These settings should be configured at the database level via
-- postgresql.conf or PGDATA environment variables for production:
--   autovacuum = on
--   autovacuum_naptime = '10s'
--   autovacuum_vacuum_threshold = 50
--   autovacuum_vacuum_scale_factor = 0.1

-- ============================================================================
-- SEED DATA (Optional for development)
-- ============================================================================
-- Uncomment to seed initial campaign for testing
-- INSERT INTO campaigns (name, description, status, budget_cents) VALUES
--     ('Demo Campaign', 'Example lead generation campaign', 'active', 100000);
