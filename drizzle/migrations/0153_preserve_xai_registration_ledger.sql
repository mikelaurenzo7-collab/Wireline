-- 0153: Preserve xAI Direct SIP registration credentials across tenant/agent deletion.
--
-- xAI returns dispatch_signing_secret only at registration time and currently
-- documents no deletion endpoint for phone registrations. Cascading ownership
-- foreign keys could therefore erase the only verification secret while the
-- provider registration remained live. The columns remain NOT NULL ownership
-- pointers and RLS remains unchanged, but provider cleanup/reuse is no longer
-- coupled to tenant-row lifetime.

ALTER TABLE public.wireline_xai_phone_bindings
  DROP CONSTRAINT IF EXISTS wireline_xai_phone_bindings_user_id_fkey;

ALTER TABLE public.wireline_xai_phone_bindings
  DROP CONSTRAINT IF EXISTS wireline_xai_phone_bindings_agent_id_fkey;

COMMENT ON TABLE public.wireline_xai_phone_bindings IS
  'Platform-retained Twilio/xAI Direct SIP registration ledger with encrypted one-time webhook verification secrets and current tenant ownership pointers.';
