-- Schema drift fix: columns present in src/db/schema.ts but never migrated.
ALTER TABLE wireline_settings
  ADD COLUMN IF NOT EXISTS csat_sms_enabled boolean DEFAULT false;

ALTER TABLE wireline_call_logs
  ADD COLUMN IF NOT EXISTS csat_score integer,
  ADD COLUMN IF NOT EXISTS ttft_ms integer,
  ADD COLUMN IF NOT EXISTS ttf_audio_ms integer,
  ADD COLUMN IF NOT EXISTS stt_error boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tts_error boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pipeline_error text,
  ADD COLUMN IF NOT EXISTS latency_p50_ms integer,
  ADD COLUMN IF NOT EXISTS latency_p95_ms integer;

CREATE INDEX IF NOT EXISTS idx_call_logs_ttft ON wireline_call_logs USING btree (ttft_ms) WHERE ttft_ms IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_pipeline_error ON wireline_call_logs USING btree (pipeline_error) WHERE pipeline_error IS NOT NULL;
