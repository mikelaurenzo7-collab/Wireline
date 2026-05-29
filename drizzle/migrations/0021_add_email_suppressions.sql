-- Email suppression list for CAN-SPAM / one-click (RFC 8058) unsubscribe.
--
-- Commercial / relationship-marketing email (e.g. trial-ending reminders)
-- must honor opt-outs. Before sending such an email the app checks this
-- table; the /api/email/unsubscribe endpoint (header one-click POST + the
-- human GET link) records the opt-out here. Transactional mail (password
-- reset, email verification, payment-failed) is exempt and is NOT gated.
--
-- Global, email-keyed (not tenant-scoped): a recipient who opts out should
-- stay opted out regardless of which account triggered the message.

CREATE TABLE IF NOT EXISTS wireline_email_suppressions (
  email       text PRIMARY KEY,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_suppressions_created
  ON wireline_email_suppressions USING btree (created_at DESC);
