-- Performance hygiene: the KV table already has a primary key and retains one
-- text_pattern_ops index for prefix lookups. These three indexes were exact
-- duplicates introduced by repeated migration runs.
DROP INDEX IF EXISTS public.kv_store_64639c03_key_idx1;
DROP INDEX IF EXISTS public.kv_store_64639c03_key_idx2;
DROP INDEX IF EXISTS public.kv_store_64639c03_key_idx3;
