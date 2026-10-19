-- 0182 — the owner's Playbook for each Bot.
--
-- Exact lines for key moments, situation scripts, and always-mention /
-- never-say lists, stored as one validated jsonb document on the Bot. Every
-- runtime (phone, rehearsal, SMS and email replies) appends it to the Bot's
-- instructions. The row already belongs to one tenant and is erased with it.
ALTER TABLE "wireline_agents" ADD COLUMN IF NOT EXISTS "playbook" jsonb;
