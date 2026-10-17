import { Router, type Response } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { authenticateUser } from "../middleware/auth";
import { validate } from "../middleware/input-validation";
import { claudeRateLimiter } from "../middleware/api-rate-limits";
import { drizzle, log } from "../lib/server-context";
import type { AuthenticatedRequest } from "../types/auth";
import {
  parseExtensionBrowserContext,
  type BrowserCommandContext,
} from "../lib/browser-command-context";
import {
  BROWSER_HANDOFF_TTL_MS,
  createBrowserHandoffId,
  decryptBrowserHandoffContext,
  encryptBrowserHandoffContext,
  hashBrowserHandoffId,
  isBrowserHandoffVaultConfigured,
  studioHandoffUrl,
} from "../lib/browser-handoff-token";

const router = Router();

const exchangeSchema = z.object({
  version: z.literal(1),
  source: z.literal("browser-extension"),
  capturedAt: z.string().min(1),
  title: z.string().max(180).optional().default(""),
  url: z.string().max(2048).optional().default(""),
  description: z.string().max(320).optional().default(""),
  selection: z.string().max(1600).optional().default(""),
  link: z.string().max(512).optional().default(""),
  request: z.string().max(800).optional().default(""),
});

const redeemQuerySchema = z.object({
  handoff_id: z.string().min(1),
});

type HandoffStorageSnapshot = {
  runtime_role: string;
  rls_enabled: boolean;
  can_select: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
  columns: string[];
  policies: Array<{
    policyname: string;
    permissive: string;
    roles: string[];
    cmd: string;
    qual: string | null;
    with_check: string | null;
  }>;
};

const HANDOFF_COLUMNS = [
  "id_hash",
  "user_id",
  "context_encrypted",
  "expires_at",
  "redeemed_at",
  "created_at",
];

function isTenantOwnerExpression(expression: string | null): boolean {
  if (typeof expression !== "string") return false;
  // PostgreSQL may render the scalar SELECT with an output alias. Accept only
  // the known owner equality, never an expression merely containing its name.
  const normalized = expression
    .toLowerCase()
    .replace(/\bpublic\./g, "")
    .replace(/[\s()]/g, "");
  return [
    "user_id=wireline_current_user_id",
    "user_id=selectwireline_current_user_id",
    "user_id=selectwireline_current_user_idaswireline_current_user_id",
  ].includes(normalized);
}

export function browserHandoffStorageReady(snapshot: HandoffStorageSnapshot | undefined): boolean {
  if (
    !snapshot ||
    snapshot.runtime_role !== "wireline_server" ||
    snapshot.rls_enabled !== true ||
    ![snapshot.can_select, snapshot.can_insert, snapshot.can_update, snapshot.can_delete].every(
      (allowed) => allowed === true,
    ) ||
    !Array.isArray(snapshot.columns) ||
    !HANDOFF_COLUMNS.every((column) => snapshot.columns.includes(column)) ||
    !Array.isArray(snapshot.policies)
  )
    return false;
  const tenantPolicies = snapshot.policies.filter(
    (policy) =>
      Array.isArray(policy.roles) &&
      (policy.roles.includes("wireline_server") || policy.roles.includes("public")),
  );
  // Additional permissive policies can broaden access; restrictive policies
  // can make a healthy tenant unusable. Both require an explicit schema review.
  if (tenantPolicies.length !== 1) return false;
  const policy = tenantPolicies[0];
  return (
    policy.policyname === "tenant_isolation" &&
    policy.permissive === "PERMISSIVE" &&
    policy.roles.length === 1 &&
    policy.roles[0] === "wireline_server" &&
    policy.cmd === "ALL" &&
    isTenantOwnerExpression(policy.qual) &&
    isTenantOwnerExpression(policy.with_check)
  );
}

let handoffSchemaReady: Promise<void> | null = null;

export async function ensureBrowserHandoffSchema(): Promise<void> {
  if (!handoffSchemaReady) {
    handoffSchemaReady = (async () => {
      // Schema promotion owns DDL. Authenticated requests run as wireline_server,
      // which deliberately has DML privileges and cannot ALTER the owner table.
      const result = await drizzle.execute(sql`
        SELECT current_user::text AS runtime_role,
          c.relrowsecurity AS rls_enabled,
          has_table_privilege(current_user, c.oid, 'SELECT') AS can_select,
          has_table_privilege(current_user, c.oid, 'INSERT') AS can_insert,
          has_table_privilege(current_user, c.oid, 'UPDATE') AS can_update,
          has_table_privilege(current_user, c.oid, 'DELETE') AS can_delete,
          ARRAY(
            SELECT a.attname::text FROM pg_attribute a
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
          ) AS columns,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'policyname', p.policyname, 'permissive', p.permissive,
              'roles', p.roles, 'cmd', p.cmd,
              'qual', p.qual, 'with_check', p.with_check
            ))
            FROM pg_policies p
            WHERE p.schemaname = 'public' AND p.tablename = 'wireline_browser_handoffs'
          ), '[]'::jsonb) AS policies
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'wireline_browser_handoffs'
          AND c.relkind = 'r'
      `);
      const [snapshot] = resultRows<HandoffStorageSnapshot>(result);
      if (!browserHandoffStorageReady(snapshot)) throw new Error("HANDOFF_STORAGE_NOT_READY");
    })().catch(() => {
      handoffSchemaReady = null;
      log.warn("Browser handoff storage readiness could not be confirmed");
      throw new AppError(
        503,
        "BROWSER_HANDOFF_STORAGE_UNAVAILABLE",
        "Browser handoff storage is temporarily unavailable. Contact support if this continues.",
      );
    });
  }
  await handoffSchemaReady;
}

async function cleanupBrowserHandoffs(): Promise<void> {
  await drizzle.execute(sql`
    DELETE FROM wireline_browser_handoffs
    WHERE expires_at <= now()
       OR redeemed_at IS NOT NULL
  `);
}

function resultRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] })?.rows || []) as T[];
}

function normalizeExchangeBody(body: z.infer<typeof exchangeSchema>): BrowserCommandContext | null {
  return parseExtensionBrowserContext({
    version: body.version,
    source: body.source,
    capturedAt: body.capturedAt,
    title: body.title,
    url: body.url,
    description: body.description,
    selection: body.selection,
    link: body.link,
    request: body.request,
  });
}

router.post(
  "/api/browser/handoff/exchange",
  // Authenticate first so the limiter keys on the user id rather than a
  // per-session digest — otherwise rotating the session mints a fresh bucket.
  authenticateUser,
  claudeRateLimiter,
  validate({ body: exchangeSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    const context = normalizeExchangeBody(req.body);
    if (!context) {
      throw AppError.fromHttpStatus(400, "Invalid or expired browser handoff context.");
    }
    if (!isBrowserHandoffVaultConfigured()) {
      throw AppError.fromHttpStatus(503, "Browser handoff encryption is not configured.");
    }

    await ensureBrowserHandoffSchema();
    await cleanupBrowserHandoffs();

    const handoffId = createBrowserHandoffId();
    const encryptedContext = encryptBrowserHandoffContext(context);
    await drizzle.execute(sql`
      INSERT INTO wireline_browser_handoffs (id_hash, user_id, context_encrypted, expires_at)
      VALUES (
        ${hashBrowserHandoffId(handoffId)},
        ${req.user.id},
        ${encryptedContext},
        ${new Date(Date.now() + BROWSER_HANDOFF_TTL_MS)}
      )
    `);

    res.json({
      handoff_id: handoffId,
      studio_url: studioHandoffUrl(handoffId),
    });
  },
);

router.get(
  "/api/browser/handoff/redeem",
  authenticateUser,
  claudeRateLimiter,
  validate({ query: redeemQuerySchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    await ensureBrowserHandoffSchema();
    const handoffId = String(req.query.handoff_id || "");
    const result = await drizzle.execute(sql`
      UPDATE wireline_browser_handoffs
      SET redeemed_at = now()
      WHERE id_hash = ${hashBrowserHandoffId(handoffId)}
        AND user_id = ${req.user.id}
        AND redeemed_at IS NULL
        AND expires_at > now()
      RETURNING context_encrypted
    `);
    const [row] = resultRows<{ context_encrypted: string }>(result);
    const context = row ? decryptBrowserHandoffContext(row.context_encrypted) : null;
    if (!context) {
      log.warn("Browser handoff redeem failed", { userId: req.user.id });
      throw AppError.fromHttpStatus(400, "Invalid or expired handoff id.");
    }
    res.json({ context });
  },
);

export default router;
