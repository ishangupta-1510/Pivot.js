-- Migration: Create dataset_issues table for tracking errors and warnings
-- This table stores all issues (errors, warnings, info) that occur during dataset processing
-- Linked to datasets table via foreign key relationship

-- Create enum type for issue severity levels
CREATE TYPE issue_severity AS ENUM ('error', 'warning', 'info');

-- Create enum type for issue categories
CREATE TYPE issue_category AS ENUM (
    'data_validation',
    'type_mismatch',
    'format_error',
    'missing_value',
    'duplicate_value',
    'constraint_violation',
    'parsing_error',
    'calculation_error',
    'system_error',
    'other'
);

-- Create the dataset_issues table
CREATE TABLE IF NOT EXISTS public.dataset_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs.upload_jobs(id) ON DELETE SET NULL,
    
    -- Issue details
    severity issue_severity NOT NULL,
    category issue_category NOT NULL DEFAULT 'other',
    code VARCHAR(50),  -- Error code (e.g., 'CSV_PARSE_001', 'TYPE_MISMATCH_002')
    message TEXT NOT NULL,
    details JSONB,  -- Additional structured details about the issue
    
    -- Location information
    row_number INTEGER,  -- Which row had the issue (null for file-level issues)
    column_name VARCHAR(255),  -- Which column had the issue (null for row-level issues)
    cell_value TEXT,  -- The problematic value (truncated if too long)
    
    -- Context
    batch_number INTEGER,  -- Which processing batch this occurred in
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Resolution tracking
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_dataset_issues_dataset_id ON public.dataset_issues(dataset_id);
CREATE INDEX idx_dataset_issues_job_id ON public.dataset_issues(job_id);
CREATE INDEX idx_dataset_issues_severity ON public.dataset_issues(severity);
CREATE INDEX idx_dataset_issues_category ON public.dataset_issues(category);
CREATE INDEX idx_dataset_issues_row_number ON public.dataset_issues(row_number);
CREATE INDEX idx_dataset_issues_is_resolved ON public.dataset_issues(is_resolved);
CREATE INDEX idx_dataset_issues_occurred_at ON public.dataset_issues(occurred_at DESC);

-- Create composite index for common query patterns
CREATE INDEX idx_dataset_issues_dataset_severity ON public.dataset_issues(dataset_id, severity);
CREATE INDEX idx_dataset_issues_dataset_unresolved ON public.dataset_issues(dataset_id, is_resolved) WHERE is_resolved = FALSE;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dataset_issues_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dataset_issues_updated_at
    BEFORE UPDATE ON public.dataset_issues
    FOR EACH ROW
    EXECUTE FUNCTION update_dataset_issues_updated_at();

-- Create a view for issue statistics per dataset
CREATE OR REPLACE VIEW public.dataset_issue_stats AS
SELECT 
    dataset_id,
    COUNT(*) AS total_issues,
    COUNT(*) FILTER (WHERE severity = 'error') AS error_count,
    COUNT(*) FILTER (WHERE severity = 'warning') AS warning_count,
    COUNT(*) FILTER (WHERE severity = 'info') AS info_count,
    COUNT(*) FILTER (WHERE is_resolved = FALSE) AS unresolved_count,
    COUNT(*) FILTER (WHERE is_resolved = TRUE) AS resolved_count,
    MIN(occurred_at) AS first_issue_at,
    MAX(occurred_at) AS last_issue_at
FROM public.dataset_issues
GROUP BY dataset_id;

-- Create a function to log issues during processing
CREATE OR REPLACE FUNCTION log_dataset_issue(
    p_dataset_id UUID,
    p_severity issue_severity,
    p_category issue_category,
    p_message TEXT,
    p_code VARCHAR(50) DEFAULT NULL,
    p_row_number INTEGER DEFAULT NULL,
    p_column_name VARCHAR(255) DEFAULT NULL,
    p_cell_value TEXT DEFAULT NULL,
    p_batch_number INTEGER DEFAULT NULL,
    p_details JSONB DEFAULT NULL,
    p_job_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_issue_id UUID;
BEGIN
    INSERT INTO public.dataset_issues (
        dataset_id,
        job_id,
        severity,
        category,
        code,
        message,
        details,
        row_number,
        column_name,
        cell_value,
        batch_number
    ) VALUES (
        p_dataset_id,
        p_job_id,
        p_severity,
        p_category,
        p_code,
        p_message,
        p_details,
        p_row_number,
        p_column_name,
        LEFT(p_cell_value, 1000),  -- Truncate to 1000 chars if too long
        p_batch_number
    ) RETURNING id INTO v_issue_id;
    
    RETURN v_issue_id;
END;
$$ LANGUAGE plpgsql;

-- Add columns to datasets table for issue summary (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'datasets' 
                   AND column_name = 'has_errors') THEN
        ALTER TABLE public.datasets ADD COLUMN has_errors BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'datasets' 
                   AND column_name = 'has_warnings') THEN
        ALTER TABLE public.datasets ADD COLUMN has_warnings BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'datasets' 
                   AND column_name = 'issue_count') THEN
        ALTER TABLE public.datasets ADD COLUMN issue_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Create a trigger to update dataset issue flags when issues are logged
CREATE OR REPLACE FUNCTION update_dataset_issue_flags()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the dataset's issue summary
    UPDATE public.datasets
    SET 
        has_errors = EXISTS (
            SELECT 1 FROM public.dataset_issues 
            WHERE dataset_id = NEW.dataset_id AND severity = 'error'
        ),
        has_warnings = EXISTS (
            SELECT 1 FROM public.dataset_issues 
            WHERE dataset_id = NEW.dataset_id AND severity = 'warning'
        ),
        issue_count = (
            SELECT COUNT(*) FROM public.dataset_issues 
            WHERE dataset_id = NEW.dataset_id
        )
    WHERE id = NEW.dataset_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dataset_issue_flags
    AFTER INSERT OR UPDATE OR DELETE ON public.dataset_issues
    FOR EACH ROW
    EXECUTE FUNCTION update_dataset_issue_flags();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.dataset_issues TO PUBLIC;
GRANT USAGE ON TYPE issue_severity TO PUBLIC;
GRANT USAGE ON TYPE issue_category TO PUBLIC;

-- Add comments for documentation
COMMENT ON TABLE public.dataset_issues IS 'Stores errors, warnings, and info messages that occur during dataset processing';
COMMENT ON COLUMN public.dataset_issues.dataset_id IS 'References the dataset this issue belongs to';
COMMENT ON COLUMN public.dataset_issues.severity IS 'Severity level: error, warning, or info';
COMMENT ON COLUMN public.dataset_issues.category IS 'Category of the issue for grouping and filtering';
COMMENT ON COLUMN public.dataset_issues.code IS 'Unique error code for programmatic handling';
COMMENT ON COLUMN public.dataset_issues.row_number IS 'Row number where the issue occurred (1-indexed)';
COMMENT ON COLUMN public.dataset_issues.column_name IS 'Column name where the issue occurred';
COMMENT ON COLUMN public.dataset_issues.cell_value IS 'The problematic value (truncated to 1000 chars)';
COMMENT ON COLUMN public.dataset_issues.details IS 'Additional structured details in JSON format';