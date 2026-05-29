-- This current_setting-based tenant isolation pattern requires the app to run:
--   SET app.current_user_id = '<wireline user id>'
-- on every connection before executing tenant-scoped queries.

ALTER TABLE "wireline_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_workspace_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_agents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_calls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_call_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_usage_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_knowledge_base_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_call_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_user_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_user_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_lead_lists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_lead_list_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_prompt_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_activity_feed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wireline_support_tickets" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "wireline_users"
  FOR ALL
  USING (id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_workspaces"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_workspace_memberships"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_agents"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_contacts"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_calls"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_campaigns"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_call_events"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_enrollments"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_usage_snapshots"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_audit_logs"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_subscriptions"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_api_keys"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_knowledge_base_documents"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_conversations"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_messages"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_integrations"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_call_summaries"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_webhook_events"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_user_sessions"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_user_invitations"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_lead_lists"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_lead_list_items"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_prompt_templates"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_activity_feed"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "tenant_isolation" ON "wireline_support_tickets"
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::bigint)
  WITH CHECK (user_id = current_setting('app.current_user_id')::bigint);
