-- 0184: per-Bot live-call recording choice.
--
-- Recording is an owner choice per Bot, off by default. When a Bot's owner
-- turns it on, the carrier records that Bot's bridged live calls and the
-- Bot's spoken opening carries the recording notice — one flag drives both
-- capture and disclosure so the two can never disagree.
ALTER TABLE "wireline_agents" ADD COLUMN IF NOT EXISTS "call_recording_enabled" boolean DEFAULT false NOT NULL;
