import { createClient } from "@supabase/supabase-js";
import { AuditLogger } from "./audit-logger";
import { createRbacMiddleware } from "../middleware/require-role";
import { QuotaTracker, type PlanTier } from "./tenant-quotas";

export const IS_PROD = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

// ────────────────────────────────────────────────────────────────────
//  Structured logger
// ────────────────────────────────────────────────────────────────────
type LogLevel = "debug" | "info" | "warn" | "error";
function emitLog(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, msg, ...(fields || {}) };
  if (IS_PROD) {
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(JSON.stringify(entry));
  } else {
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(
      `[${level}]`, msg, fields ?? ""
    );
  }
}
export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emitLog("debug", msg, fields),
  info:  (msg: string, fields?: Record<string, unknown>) => emitLog("info", msg, fields),
  warn:  (msg: string, fields?: Record<string, unknown>) => emitLog("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emitLog("error", msg, fields),
};

// ────────────────────────────────────────────────────────────────────
//  fetchWithTimeout
// ────────────────────────────────────────────────────────────────────
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────
//  Database Initialization
// ────────────────────────────────────────────────────────────────────
const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://placeholder-url.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder-key";
export const db = createClient(supabaseUrl, supabaseKey);

// ────────────────────────────────────────────────────────────────────
//  Audit Logger & RBAC Middleware
// ────────────────────────────────────────────────────────────────────
export const auditLogger = new AuditLogger(db);
export const { requirePermission, requireRole } = createRbacMiddleware({ db, auditLogger });

// ────────────────────────────────────────────────────────────────────
//  Quota Tracker
// ────────────────────────────────────────────────────────────────────
export const quotaTracker = new QuotaTracker({
  db,
  getPlanForUser: async (userId: string): Promise<PlanTier> => {
    try {
      const { data } = await db
        .from('wireline_settings')
        .select('subscription_status')
        .eq('user_id', userId)
        .maybeSingle();
      const status = (data as { subscription_status?: string } | null)?.subscription_status ?? 'free';
      if (status === 'enterprise') return 'enterprise';
      if (status === 'pro')        return 'pro';
      if (status === 'starter' || status === 'active') return 'starter';
      return 'free';
    } catch {
      return 'starter'; // Fail-open on DB errors.
    }
  }
});
