-- Workspace-native booking. Existing appointments are retained unchanged; no
-- UTC/timezone/duration is inferred from their historical free-text fields.
SET lock_timeout = '5s';

ALTER TABLE public.wireline_settings ADD COLUMN native_calendar jsonb;
ALTER TABLE public.wireline_appointments
  ADD COLUMN start_at timestamptz,
  ADD COLUMN end_at timestamptz,
  ADD COLUMN time_zone text,
  ADD COLUMN booking_source text,
  ADD COLUMN booking_request_key text,
  ADD COLUMN booking_fingerprint text,
  ADD COLUMN buffer_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.wireline_appointments ADD CONSTRAINT appointments_native_interval_valid CHECK (
  buffer_minutes BETWEEN 0 AND 120
  AND ((start_at IS NULL AND end_at IS NULL) OR (start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at))
  AND (booking_source IS DISTINCT FROM 'native' OR (
    start_at IS NOT NULL AND end_at IS NOT NULL AND time_zone IS NOT NULL
    AND booking_request_key IS NOT NULL AND length(booking_request_key) BETWEEN 1 AND 200
    AND booking_fingerprint IS NOT NULL AND booking_fingerprint ~ '^[0-9a-f]{64}$'
  ))
);
CREATE UNIQUE INDEX uq_appointments_booking_request
  ON public.wireline_appointments (user_id, booking_request_key)
  WHERE booking_request_key IS NOT NULL;
CREATE INDEX idx_appointments_user_start ON public.wireline_appointments (user_id, start_at);

-- Existing table-level wireline_server grants and tenant RLS cover the new
-- columns. Existing account deletion/export covers both tables. This invoker
-- trigger does not bypass tenant RLS and locks every writer, including legacy
-- paths, before testing overlap. No extension or new tenant table is required.
CREATE FUNCTION public.guard_native_calendar_appointment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('native-calendar:' || NEW.user_id::text, 0));
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.booking_request_key IS DISTINCT FROM OLD.booking_request_key AND OLD.booking_request_key IS NOT NULL
      OR NEW.booking_fingerprint IS DISTINCT FROM OLD.booking_fingerprint AND OLD.booking_fingerprint IS NOT NULL THEN
      RAISE EXCEPTION 'Appointment booking identity cannot be changed' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.demo OR NEW.status NOT IN ('Scheduled', 'Confirmed', 'Requested', 'Rescheduled') THEN RETURN NEW; END IF;
  IF NEW.start_at IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.wireline_settings WHERE user_id = NEW.user_id AND native_calendar->>'enabled' = 'true')
      AND (TG_OP = 'INSERT' OR NEW.date IS DISTINCT FROM OLD.date OR NEW.time IS DISTINCT FROM OLD.time
        OR OLD.status NOT IN ('Scheduled', 'Confirmed', 'Requested', 'Rescheduled')) THEN
      RAISE EXCEPTION 'Use the Calendar booking service to schedule an appointment' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.wireline_appointments a
    WHERE a.user_id = NEW.user_id AND a.id <> NEW.id AND NOT a.demo
      AND a.status IN ('Scheduled', 'Confirmed', 'Requested', 'Rescheduled')
      AND a.start_at IS NOT NULL
      AND NEW.start_at < a.end_at + make_interval(mins => a.buffer_minutes)
      AND a.start_at < NEW.end_at + make_interval(mins => NEW.buffer_minutes)
  ) THEN
    RAISE EXCEPTION 'That appointment time is no longer available' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_native_calendar_appointment() FROM PUBLIC;
CREATE TRIGGER guard_native_calendar_appointment
  BEFORE INSERT OR UPDATE ON public.wireline_appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_native_calendar_appointment();

COMMENT ON COLUMN public.wireline_settings.native_calendar IS 'Owner-configured native booking hours, timezone, duration and explicit automatic/approval policy. Null preserves existing connector mode.';
COMMENT ON COLUMN public.wireline_appointments.booking_request_key IS 'Tenant-scoped immutable retry identity. Cancellation retains the receipt; account erasure removes it.';
RESET lock_timeout;
