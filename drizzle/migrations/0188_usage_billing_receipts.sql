ALTER TABLE "wireline_computer_tasks" ADD COLUMN "usage_receipt" jsonb;
--> statement-breakpoint
-- This existing operation table is owned by the security-schema typed mirror,
-- outside the generated schema.ts snapshot. Null historical keys cannot resume
-- a usage purchase; its payable session must be retired before replacement.
ALTER TABLE public.wireline_checkout_operations ADD COLUMN configuration_key text;
