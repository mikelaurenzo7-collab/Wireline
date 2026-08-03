import { createHmac } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { drizzle } from "../lib/server-context";
import { generateToken } from "../lib/auth-service";
import {
  clearOAuthBridgeStateCookie,
  readOAuthBridgeStateCookie,
} from "../lib/oauth-bridge-cookie";
import { authSuccessBody, setSessionCookie } from "../lib/session-cookie";
import { oauthRateLimiter } from "../middleware/rate-limit-middleware";
import * as schema from "../db/schema";

const router = Router();
const BRIDGE_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function oauthBridgeSecret(): string {
  const secret =
    process.env.OAUTH_BRIDGE_SECRET ||
    process.env.OAUTH_STATE_SECRET ||
    process.env.INTERNAL_JWT_SECRET ||
    process.env.JWT_SECRET;
  if (!secret) throw new Error("OAuth bridge secret is not configured.");
  return secret;
}

function hashOAuthBridgeValue(value: string): string {
  return createHmac("sha256", oauthBridgeSecret()).update(value, "utf8").digest("hex");
}

router.post(
  "/api/auth/oauth/exchange",
  oauthRateLimiter,
  async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Referrer-Policy", "no-referrer");

    const code = req.body?.code;
    const bridgeState = readOAuthBridgeStateCookie(req);
    if (typeof code !== "string" || !BRIDGE_CODE_PATTERN.test(code) || !bridgeState) {
      throw AppError.fromHttpStatus(400, "Invalid or expired code");
    }

    const rows = (await drizzle.execute(sql`
      DELETE FROM wireline_oauth_pending_codes
      WHERE code_hash = ${hashOAuthBridgeValue(code)}
        AND bridge_state_hash = ${hashOAuthBridgeValue(bridgeState)}
        AND expires_at > clock_timestamp()
      RETURNING user_id, email, full_name, is_owner
    `)) as unknown as {
      rows?: Array<{
        user_id: string;
        email: string;
        full_name: string | null;
        is_owner: boolean;
      }>;
    };
    const entry = rows.rows?.[0];
    if (!entry) throw AppError.fromHttpStatus(400, "Invalid or expired code");

    clearOAuthBridgeStateCookie(res);
    const sessionToken = generateToken({ id: entry.user_id, email: entry.email });
    setSessionCookie(res, sessionToken);

    const [sub] = await drizzle
      .select({ plan: schema.subscriptions.plan })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, entry.user_id))
      .limit(1);
    const { resolveAccountType } = await import("../lib/account-type");
    const { ensureDefaultAccount } = await import("../lib/account-service");
    const account_type = (
      await ensureDefaultAccount(entry.user_id, resolveAccountType(sub?.plan))
    ).type;

    return res.json({
      ...authSuccessBody({
        id: entry.user_id,
        email: entry.email,
        full_name: entry.full_name,
        is_owner: entry.is_owner,
        account_type,
      }),
      user_id: entry.user_id,
      email: entry.email,
      name: entry.full_name ?? "",
      is_owner: entry.is_owner ? "1" : "0",
    });
  },
);

export default router;
