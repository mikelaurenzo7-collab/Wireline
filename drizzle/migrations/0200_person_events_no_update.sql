-- 0200: person history is append-or-delete for the server role, as 0197 says.
--
-- Bug fixed. 0197 granted SELECT, INSERT, DELETE on wireline_person_events and
-- documented "No UPDATE grant". The shared database carries default privileges
-- that give wireline_server SELECT, INSERT, UPDATE, DELETE on every new table
-- the migration owner creates, and a GRANT never removes a privilege, so the
-- default UPDATE stayed. Verified in the live catalog on 2026-11-26: UPDATE
-- held, zero event rows.
--
-- The People service never updates an event: tests/db/people.db.test.ts runs
-- create, note, merge, unmerge and delete without the privilege. Revoking it
-- changes no behaviour, and a replay is harmless.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    REVOKE UPDATE ON public.wireline_person_events FROM wireline_server;
  END IF;
END
$$;
