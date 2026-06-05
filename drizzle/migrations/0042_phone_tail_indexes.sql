-- Tier 3: functional indexes for 10-digit phone tail lookups (contact profile API).
CREATE INDEX IF NOT EXISTS idx_call_logs_user_phone_tail
  ON wireline_call_logs (user_id, right(regexp_replace(customer_number, '[^0-9]', '', 'g'), 10));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_outbound_leads_user_phone_tail
  ON wireline_outbound_leads (user_id, right(regexp_replace(phone_number, '[^0-9]', '', 'g'), 10));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_appointments_user_phone_tail
  ON wireline_appointments (user_id, right(regexp_replace(phone_number, '[^0-9]', '', 'g'), 10));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_lead_dossiers_user_phone_tail
  ON wireline_lead_dossiers (user_id, right(regexp_replace(customer_number, '[^0-9]', '', 'g'), 10));
