-- 0158: erase completed carrier-cleanup handoffs.
--
-- Pending rows temporarily retain the minimum identifiers needed to release a
-- former tenant's provider resource. Once resolved or safely skipped because a
-- new canonical owner exists, that cleanup purpose ends. Older workers marked
-- those rows resolved but retained the former user UUID, phone number, provider
-- id, and diagnostic error indefinitely. Remove that historical residue; the
-- current worker deletes each row atomically when its terminal outcome lands.

SET lock_timeout = '5s';

DELETE FROM public.wireline_orphan_carrier_resources
WHERE status = 'resolved';

ALTER TABLE public.wireline_orphan_carrier_resources
  DROP CONSTRAINT IF EXISTS wireline_orphan_carrier_resources_pending_only;
ALTER TABLE public.wireline_orphan_carrier_resources
  ADD CONSTRAINT wireline_orphan_carrier_resources_pending_only
  CHECK (status = 'pending');

RESET lock_timeout;
