-- Migration: per-tenant cloned-voice catalog.
--
-- ElevenLabs voice_ids are universal — once cloned on our account
-- (single org-level API key in env), any of our agents can use the
-- voice via Vapi config. We track ownership per tenant in this
-- table so deleting a tenant cleans up their clones, and so the
-- voice picker UI can scope visible voices to the requesting user.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS wireline_cloned_voices (
  voice_id    TEXT PRIMARY KEY,                              -- ElevenLabs UUID
  user_id     UUID NOT NULL,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'completed'              -- 'processing' | 'completed' | 'failed'
              CHECK (status IN ('processing', 'completed', 'failed')),
  preview_url TEXT,                                          -- ElevenLabs-hosted MP3
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloned_voices_user_created
  ON wireline_cloned_voices (user_id, created_at DESC);
