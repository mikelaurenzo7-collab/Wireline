-- 0071: Bind opaque OAuth records to the exact Wireline MCP resource.
-- Existing rows were issued only during private testing and remain nullable;
-- new authorization, access, and refresh records are written with the resource.

ALTER TABLE wireline_mcp_oauth_codes
  ADD COLUMN IF NOT EXISTS resource text;
ALTER TABLE wireline_mcp_access_tokens
  ADD COLUMN IF NOT EXISTS resource text;
ALTER TABLE wireline_mcp_refresh_tokens
  ADD COLUMN IF NOT EXISTS resource text;

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_resource
  ON wireline_mcp_oauth_codes (resource);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_resource
  ON wireline_mcp_access_tokens (resource);
