import { createClient } from "@supabase/supabase-js";

import { env } from "./env";

const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;
if (!supabaseKey) {
  throw new Error(
    "Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY"
  );
}

/**
 * Service-role / anon-key Supabase client used by the Express server.
 *
 * NOTE (Phase 1 hardening): we should migrate per-request paths to use a
 * JWT-scoped client (see `lib/supabaseScoped.ts` once added) so RLS still
 * enforces ownership server-side. This module is intentionally the *single*
 * place that reads the service-role key.
 */
export const db = createClient(env.VITE_SUPABASE_URL, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
