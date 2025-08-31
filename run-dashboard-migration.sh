#!/bin/bash

echo "Creating dashboards table..."

docker exec pivot-grid-postgres psql -U pivot_user -d pivot_grid_dev -c "
-- Create dashboards table for storing pivot grid configurations
CREATE TABLE IF NOT EXISTS public.dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}',
    expected_fields JSONB DEFAULT '[]',
    data_source_type VARCHAR(100) DEFAULT 'csv',
    layout JSONB DEFAULT '{}',
    theme VARCHAR(50) DEFAULT 'default',
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT false,
    is_template BOOLEAN DEFAULT false,
    tags TEXT[],
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT dashboards_name_unique UNIQUE(name, deleted_at)
);
"

echo "Creating indexes..."

docker exec pivot-grid-postgres psql -U pivot_user -d pivot_grid_dev -c "
CREATE INDEX IF NOT EXISTS idx_dashboards_created_at ON public.dashboards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboards_updated_at ON public.dashboards(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboards_last_accessed ON public.dashboards(last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboards_created_by ON public.dashboards(created_by);
CREATE INDEX IF NOT EXISTS idx_dashboards_deleted_at ON public.dashboards(deleted_at);
CREATE INDEX IF NOT EXISTS idx_dashboards_tags ON public.dashboards USING GIN(tags);
"

echo "Creating update trigger function..."

docker exec pivot-grid-postgres psql -U pivot_user -d pivot_grid_dev -c "
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS \$\$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
\$\$ language 'plpgsql';
"

echo "Creating update trigger..."

docker exec pivot-grid-postgres psql -U pivot_user -d pivot_grid_dev -c "
DROP TRIGGER IF EXISTS update_dashboards_updated_at ON public.dashboards;
CREATE TRIGGER update_dashboards_updated_at BEFORE UPDATE ON public.dashboards
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
"

echo "Creating dashboard_shares table..."

docker exec pivot-grid-postgres psql -U pivot_user -d pivot_grid_dev -c "
CREATE TABLE IF NOT EXISTS public.dashboard_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
    shared_with VARCHAR(255) NOT NULL,
    permission VARCHAR(50) NOT NULL DEFAULT 'view',
    shared_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    shared_by VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT dashboard_shares_unique UNIQUE(dashboard_id, shared_with)
);
"

echo "Creating dashboard_shares indexes..."

docker exec pivot-grid-postgres psql -U pivot_user -d pivot_grid_dev -c "
CREATE INDEX IF NOT EXISTS idx_dashboard_shares_dashboard_id ON public.dashboard_shares(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_shares_shared_with ON public.dashboard_shares(shared_with);
"

echo "Dashboard migration completed!"