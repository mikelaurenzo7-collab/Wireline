-- WIRELINE TEAM RBAC RLS UPGRADE
-- This migration enables team members to access tenant data.

-- 1. Create helper function for team access check
CREATE OR REPLACE FUNCTION wireline_is_team_member(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM wireline_team_members
        WHERE tenant_id = p_tenant_id
          AND user_id = auth.uid()
          AND revoked_at IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update policies for core tables
DO $$
DECLARE
    t TEXT;
    p_name TEXT;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name LIKE 'wireline_%'
          AND table_name NOT IN ('wireline_team_members', 'wireline_stripe_events')
    LOOP
        -- Skip tables that don't have user_id
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = t AND column_name = 'user_id'
        ) THEN
            -- Drop existing "Users can manage their own..." policies
            -- and replace with team-aware policies.
            -- Note: We use dynamic SQL to drop and create.
            
            p_name := 'Team access for ' || t;
            
            -- Drop if exists (manual approach as DROP POLICY IF EXISTS is standard)
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Users can manage their own ' || substring(t from 10), t);
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Users can view their own ' || substring(t from 10), t);
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p_name, t);
            
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR ALL USING (auth.uid() = user_id OR wireline_is_team_member(user_id)) WITH CHECK (auth.uid() = user_id OR wireline_is_team_member(user_id))',
                p_name, t
            );
        END IF;
    END LOOP;
END $$;

-- 3. Special handling for wireline_team_members
-- Owners and Admins can manage team members.
CREATE POLICY "Owners and Admins can manage team" ON wireline_team_members
FOR ALL USING (
    auth.uid() = tenant_id OR 
    EXISTS (
        SELECT 1 FROM wireline_team_members
        WHERE tenant_id = wireline_team_members.tenant_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
          AND revoked_at IS NULL
    )
);
