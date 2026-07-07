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

let handoffSchemaReady: Promise<void> | null = null;

async function ensureBrowserHandoffSchema(): Promise<void> {
  if (!handoffSchemaReady) {
    handoffSchemaReady = (async () => {
      await drizzle.execute(sql`
        CREATE TABLE IF NOT EXISTS wireline_browser_handoffs (
          id_hash text PRIMARY KEY,
          user_id uuid NOT NULL,
          context_encrypted text NOT NULL,
          expires_at timestamptz NOT NULL,
          redeemed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await drizzle.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_browser_handoffs_user_expires
          ON wireline_browser_handoffs (user_id, expires_at)
      `);
      await drizzle.execute(sql`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            REVOKE ALL ON wireline_browser_handoffs FROM anon;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            REVOKE ALL ON wireline_browser_handoffs FROM authenticated;
          END IF;
        END $$;
      `);
      await drizzle.execute(sql`
        DO $$
        BEGIN
          EXECUTE 'ALTER TABLE public.wireline_browser_handoffs ENABLE ROW LEVEL SECURITY';
          EXECUTE 'DROP POLICY IF EXISTS deny_direct_api_access ON public.wireline_browser_handoffs';

          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
             AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE 'CREATE POLICY deny_direct_api_access ON public.wireline_browser_handoffs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
          END IF;
        END $$;
      `);
    })().catch((error) => {
      handoffSchemaReady = null;
      throw error;
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
  claudeRateLimiter,
  authenticateUser,
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
  claudeRateLimiter,
  authenticateUser,
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
