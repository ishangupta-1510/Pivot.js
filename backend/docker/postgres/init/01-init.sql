-- PostgreSQL Initialization Script for Pivot Grid Pro
-- This script sets up the database schema and optimizations

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create optimized database settings
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS jobs;
CREATE SCHEMA IF NOT EXISTS analytics;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA public TO pivot_user;
GRANT ALL PRIVILEGES ON SCHEMA jobs TO pivot_user;
GRANT ALL PRIVILEGES ON SCHEMA analytics TO pivot_user;

-- Create job management tables
CREATE TABLE IF NOT EXISTS jobs.upload_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID,
    original_filename VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    file_path VARCHAR(1000),
    file_hash VARCHAR(64),
    
    -- Job status and progress
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    progress_percentage DECIMAL(5,2) DEFAULT 0,
    rows_processed BIGINT DEFAULT 0,
    total_rows_estimated BIGINT,
    processing_speed_rows_per_sec INTEGER,
    
    -- Timing
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    estimated_completion_at TIMESTAMP,
    processing_duration_ms BIGINT,
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Metadata
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create job progress events table
CREATE TABLE IF NOT EXISTS jobs.job_progress_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs.upload_jobs(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    message TEXT,
    details JSONB,
    rows_processed BIGINT,
    percentage DECIMAL(5,2),
    processing_speed DECIMAL(10,2),
    memory_usage_mb INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create datasets table
CREATE TABLE IF NOT EXISTS public.datasets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs.upload_jobs(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    original_filename VARCHAR(500),
    total_rows BIGINT NOT NULL,
    total_columns INTEGER NOT NULL,
    file_size BIGINT,
    estimated_memory_mb DECIMAL(10,2),
    column_schema JSONB NOT NULL,
    sample_data JSONB,
    processing_stats JSONB,
    status VARCHAR(50) DEFAULT 'active',
    is_public BOOLEAN DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create partitioned dataset_rows table
CREATE TABLE IF NOT EXISTS public.dataset_rows (
    id UUID DEFAULT uuid_generate_v4(),
    dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
    row_index BIGINT NOT NULL,
    data JSONB NOT NULL,
    data_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (dataset_id, row_index)
) PARTITION BY HASH (dataset_id);

-- Create partitions (16 partitions for load distribution)
DO $$
BEGIN
    FOR i IN 0..15 LOOP
        EXECUTE format('CREATE TABLE IF NOT EXISTS public.dataset_rows_p%s PARTITION OF public.dataset_rows FOR VALUES WITH (modulus 16, remainder %s)', i, i);
    END LOOP;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_upload_jobs_status ON jobs.upload_jobs(status);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_created_at ON jobs.upload_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_file_hash ON jobs.upload_jobs(file_hash);

CREATE INDEX IF NOT EXISTS idx_job_progress_job_id ON jobs.job_progress_events(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_job_progress_event_type ON jobs.job_progress_events(event_type);

CREATE INDEX IF NOT EXISTS idx_datasets_created_by ON public.datasets(created_by);
CREATE INDEX IF NOT EXISTS idx_datasets_status ON public.datasets(status);
CREATE INDEX IF NOT EXISTS idx_datasets_job_id ON public.datasets(job_id);

-- GIN indexes for JSONB columns will be created per partition
DO $$
BEGIN
    FOR i IN 0..15 LOOP
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_dataset_rows_p%s_data_gin ON public.dataset_rows_p%s USING GIN(data)', i, i);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_dataset_rows_p%s_dataset_id ON public.dataset_rows_p%s(dataset_id)', i, i);
    END LOOP;
END $$;

-- Create update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_upload_jobs_updated_at BEFORE UPDATE ON jobs.upload_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_datasets_updated_at BEFORE UPDATE ON public.datasets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant all permissions to pivot_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pivot_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA jobs TO pivot_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pivot_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA jobs TO pivot_user;

-- Create initial admin user (for development)
INSERT INTO public.users (id, email, password_hash, role, created_at) VALUES 
    (uuid_generate_v4(), 'admin@pivotgrid.com', '$2a$10$example.hash.here', 'admin', CURRENT_TIMESTAMP)
ON CONFLICT (email) DO NOTHING;

COMMIT;