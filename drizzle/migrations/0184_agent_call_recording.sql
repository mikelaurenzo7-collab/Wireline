-- 0184: per-Bot live-call recording choice, and the durable call identity the
-- recording callback correlates against.
--
-- Recording is an owner choice per Bot, off by default. When a Bot's owner
-- turns it on, the carrier records that Bot's bridged live calls and the
-- Bot's spoken opening carries the recording notice — one flag drives both
-- capture and disclosure so the two can never disagree.
ALTER TABLE "wireline_agents" ADD COLUMN IF NOT EXISTS "call_recording_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- The exact Twilio parent call each call log row was created for, written
-- once when the row is created (inbound: the signed inbound token's CallSid;
-- outbound: the placement's persisted bridge CallSid). The live-recording
-- completion callback updates the row by this immutable SID, so a lead that is
-- redialed before the callback lands can never re-attribute its recording.
ALTER TABLE "wireline_call_logs" ADD COLUMN IF NOT EXISTS "twilio_parent_call_sid" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_call_logs_twilio_parent_call_sid" ON "wireline_call_logs" USING btree ("twilio_parent_call_sid") WHERE "twilio_parent_call_sid" IS NOT NULL;
