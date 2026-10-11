-- Retain validated Studio review cards and transactional save receipts with
-- the assistant message so owner approvals survive a page reload.
ALTER TABLE "wireline_agent_conversation_messages" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
