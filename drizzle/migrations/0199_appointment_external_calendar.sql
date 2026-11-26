-- 0199: where a Bot booking lives on the owner's own calendar.
--
-- A confirmed appointment is copied to the owner's connected Google or
-- Outlook calendar. This jsonb records which provider event is that copy
-- (provider, calendar account id, event id, and the times and title last
-- written), so a reschedule updates the same event and a cancellation removes
-- it. Null means the appointment has no copy. The row already belongs to one
-- tenant and is erased with it.
ALTER TABLE public."wireline_appointments" ADD COLUMN IF NOT EXISTS "external_calendar" jsonb;
