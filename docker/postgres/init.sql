-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Brands table
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    keywords TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Engine scans
CREATE TABLE IF NOT EXISTS engine_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    engine_name VARCHAR(100) NOT NULL,
    query TEXT NOT NULL,
    response TEXT,
    brand_mentioned BOOLEAN DEFAULT FALSE,
    sentiment VARCHAR(50),
    position INTEGER,
    embedding vector(768),
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    lessons_learned JSONB DEFAULT '{}'::jsonb
);

-- Competitors
CREATE TABLE IF NOT EXISTS competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    competitor_domain VARCHAR(255) NOT NULL,
    competitor_name VARCHAR(255),
    mention_count INTEGER DEFAULT 0,
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Recommendations
CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    recommendation TEXT NOT NULL,
    priority VARCHAR(50) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_engine_scans_brand_id ON engine_scans(brand_id);
CREATE INDEX IF NOT EXISTS idx_engine_scans_embedding ON engine_scans USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_brands_domain ON brands(domain);

-- Row level security
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_scans ENABLE ROW LEVEL SECURITY;
