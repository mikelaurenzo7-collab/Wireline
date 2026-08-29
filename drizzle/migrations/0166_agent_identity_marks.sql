-- 0166: persist a non-repeating identity mark for each Bot in a workspace.
--
-- Fifteen symbols cover the largest published plan without repeating a shape.
-- Eight colorways provide 120 unique combinations, enough for the 15-Bot Scale
-- plan plus the maximum 100 paid add-ons. Existing Bots are assigned the first
-- available deterministic identity before the uniqueness boundary is enabled.

SET lock_timeout = '5s';

ALTER TABLE public.wireline_agents
  ADD COLUMN IF NOT EXISTS mark_key text;

DO $agent_mark_capacity$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.wireline_agents
     GROUP BY user_id
    HAVING count(*) > 120
  ) THEN
    RAISE EXCEPTION
      'Bot identity migration requires every workspace to contain at most 120 agents';
  END IF;
END
$agent_mark_capacity$;

-- Old application instances can continue serving while this expand migration
-- runs. Assign a valid mark at the database boundary so a legacy INSERT that
-- omits mark_key cannot create a late NULL after the one-time backfill.
CREATE OR REPLACE FUNCTION public.assign_wireline_agent_mark_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $agent_mark_allocator$
DECLARE
  assigned_mark text;
BEGIN
  IF NEW.mark_key IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text));

  WITH
    motifs AS (
      SELECT motif, motif_order
        FROM unnest(ARRAY[
          'orbit', 'beacon', 'spark', 'prism', 'flow',
          'pulse', 'compass', 'focus', 'aperture', 'wave',
          'helix', 'loop', 'nova', 'route', 'vertex'
        ]::text[]) WITH ORDINALITY AS item(motif, motif_order)
    ),
    palettes AS (
      SELECT palette, palette_order
        FROM unnest(ARRAY[
          'violet', 'blue', 'rose', 'amber',
          'teal', 'magenta', 'indigo', 'slate'
        ]::text[]) WITH ORDINALITY AS item(palette, palette_order)
    ),
    catalog AS (
      SELECT
        motifs.motif || '-' || palettes.palette AS mark_key,
        ((palettes.palette_order - 1) * 15) + motifs.motif_order AS catalog_order
        FROM palettes
        CROSS JOIN motifs
    )
  SELECT catalog.mark_key
    INTO assigned_mark
    FROM catalog
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.wireline_agents existing
      WHERE existing.user_id = NEW.user_id
        AND existing.mark_key = catalog.mark_key
   )
   ORDER BY catalog.catalog_order
   LIMIT 1;

  IF assigned_mark IS NULL THEN
    RAISE EXCEPTION 'Bot identity capacity exhausted for workspace %', NEW.user_id
      USING ERRCODE = '23514', CONSTRAINT = 'wireline_agents_mark_key_check';
  END IF;

  NEW.mark_key := assigned_mark;
  RETURN NEW;
END
$agent_mark_allocator$;

DROP TRIGGER IF EXISTS wireline_agents_assign_mark_key ON public.wireline_agents;
CREATE TRIGGER wireline_agents_assign_mark_key
BEFORE INSERT OR UPDATE OF mark_key ON public.wireline_agents
FOR EACH ROW
EXECUTE FUNCTION public.assign_wireline_agent_mark_key();

LOCK TABLE public.wireline_agents IN SHARE ROW EXCLUSIVE MODE;

WITH
  motifs AS (
    SELECT motif, motif_order
      FROM unnest(ARRAY[
        'orbit', 'beacon', 'spark', 'prism', 'flow',
        'pulse', 'compass', 'focus', 'aperture', 'wave',
        'helix', 'loop', 'nova', 'route', 'vertex'
      ]::text[]) WITH ORDINALITY AS item(motif, motif_order)
  ),
  palettes AS (
    SELECT palette, palette_order
      FROM unnest(ARRAY[
        'violet', 'blue', 'rose', 'amber',
        'teal', 'magenta', 'indigo', 'slate'
      ]::text[]) WITH ORDINALITY AS item(palette, palette_order)
  ),
  catalog AS (
    SELECT
      motifs.motif || '-' || palettes.palette AS mark_key,
      ((palettes.palette_order - 1) * 15) + motifs.motif_order AS catalog_order
      FROM palettes
      CROSS JOIN motifs
  ),
  tenants AS (
    SELECT DISTINCT user_id
      FROM public.wireline_agents
     WHERE mark_key IS NULL
  ),
  available AS (
    SELECT
      tenants.user_id,
      catalog.mark_key,
      row_number() OVER (
        PARTITION BY tenants.user_id
        ORDER BY catalog.catalog_order
      ) AS available_order
      FROM tenants
      CROSS JOIN catalog
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.wireline_agents existing
        WHERE existing.user_id = tenants.user_id
          AND existing.mark_key = catalog.mark_key
     )
  ),
  unassigned AS (
    SELECT
      id,
      user_id,
      row_number() OVER (
        PARTITION BY user_id
        ORDER BY created_at NULLS LAST, id
      ) AS unassigned_order
      FROM public.wireline_agents
     WHERE mark_key IS NULL
  )
UPDATE public.wireline_agents agents
   SET mark_key = available.mark_key
  FROM unassigned
  JOIN available
    ON available.user_id = unassigned.user_id
   AND available.available_order = unassigned.unassigned_order
 WHERE agents.id = unassigned.id;

DO $agent_mark_backfill$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.wireline_agents
     WHERE mark_key IS NULL
  ) THEN
    RAISE EXCEPTION 'Bot identity backfill left unassigned agents';
  END IF;
END
$agent_mark_backfill$;

DO $agent_mark_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'wireline_agents_mark_key_check'
       AND conrelid = 'public.wireline_agents'::regclass
  ) THEN
    ALTER TABLE public.wireline_agents
      ADD CONSTRAINT wireline_agents_mark_key_check
      CHECK (
        mark_key IS NULL OR mark_key ~
          '^(orbit|beacon|spark|prism|flow|pulse|compass|focus|aperture|wave|helix|loop|nova|route|vertex)-(violet|blue|rose|amber|teal|magenta|indigo|slate)$'
      );
  END IF;
END
$agent_mark_constraint$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wireline_agents_user_mark_key
  ON public.wireline_agents USING btree (user_id, mark_key)
  WHERE mark_key IS NOT NULL;

COMMENT ON COLUMN public.wireline_agents.mark_key IS
  'Customer-selected BotBound identity; unique per workspace across 120 curated symbol-color combinations. A rollout trigger assigns legacy inserts until the contract migration makes the column NOT NULL.';

RESET lock_timeout;
