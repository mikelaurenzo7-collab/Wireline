import { Router, type Request, type Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle, tenantStore } from "../lib/server-context";
import { verifyInternalJwt, type JwtPayload } from "../lib/auth-utils";
import { requireInternalJwtSecret } from "../lib/internal-jwt-secret";
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  setSessionCookie,
} from "../lib/session-cookie";
import { generateToken, isOwnerEmail } from "../lib/auth-service";
import { authenticateUser } from "../middleware/auth";
import { migrateSessionRateLimiter } from "../middleware/rate-limit-middleware";
import { sessionUsers, secureTeamMembers } from "../db/security-schema";
import * as schema from "../db/schema";
import { ensureDefaultAccount } from "../lib/account-service";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

function issuedAtMs(payload: JwtPayload): number {
  const precise = Number(payload.iat_ms);
  return Number.isFinite(precise) && precise > 0 ? precise : payload.iat * 1000;
}

async function loadValidUser(payload: JwtPayload) {
  const [user] = await drizzle
    .select({
      id: sessionUsers.id,
      email: sessionUsers.email,
      sessionRevokedBefore: sessionUsers.sessionRevokedBefore,
    })
    .from(sessionUsers)
    .where(eq(sessionUsers.id, payload.sub))
    .limit(1);
  if (!user || issuedAtMs(payload) <= user.sessionRevokedBefore.getTime()) return null;
  return user;
}

async function validatedTenantId(payload: JwtPayload, userId: string): Promise<string> {
  const requested = typeof payload.tenant_id === "string" ? payload.tenant_id : "";
  if (!requested || requested === userId) return userId;
  const [membership] = await drizzle
    .select({ id: secureTeamMembers.id })
    .from(secureTeamMembers)
    .where(
      and(
        eq(secureTeamMembers.tenantId, requested),
        eq(secureTeamMembers.userId, userId),
        isNull(secureTeamMembers.revokedAt),
      ),
    )
    .limit(1);
  return membership ? requested : userId;
}

router.post(
  "/api/auth/refresh",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const token = generateToken({
      id: req.user.id,
      email: req.user.email,
      tenantId: req.tenantId,
    });
    setSessionCookie(res, token);
    const bearerRequested = (req.get("authorization") || "").toLowerCase().startsWith("bearer ");
    return res.json(bearerRequested ? { ok: true, token } : { ok: true });
  },
);

router.get("/api/auth/session", async (req: Request, res: Response) => {
  const token = getSessionTokenFromRequest(req);
  if (!token) return res.json({ user: null });

  let payload: JwtPayload | null = null;
  try {
    payload = await verifyInternalJwt(token, requireInternalJwtSecret());
  } catch {
    return res.status(503).json({
      error: "Authentication is temporarily unavailable. Platform configuration is incomplete.",
      code: "AUTH_NOT_CONFIGURED",
      requestId: res.locals?.requestId,
    });
  }
  if (!payload) return res.json({ user: null });

  const user = await loadValidUser(payload);
  if (!user) {
    clearSessionCookie(res);
    return res.json({ user: null });
  }

  const tenantId = await validatedTenantId(payload, user.id);
  return tenantStore.run(tenantId, async () => {
    const [[profile], [sub]] = await Promise.all([
      drizzle
        .select({ fullName: schema.users.fullName })
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .limit(1),
      drizzle
        .select({ plan: schema.subscriptions.plan })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, user.id))
        .limit(1),
    ]);
    const { resolveAccountType } = await import("../lib/account-type");
    const account_type = (await ensureDefaultAccount(user.id, resolveAccountType(sub?.plan))).type;
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: profile?.fullName ?? undefined,
        is_owner: isOwnerEmail(user.email),
        account_type,
        tenant_id: tenantId,
      },
    });
  });
});

router.post(
  "/api/auth/migrate-session",
  migrateSessionRateLimiter,
  async (req: Request, res: Response) => {
    const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    const legacyToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!legacyToken) {
      return res.status(400).json({
        code: "BAD_REQUEST",
        error: "Missing token. Send Authorization: Bearer <legacy-jwt>.",
      });
    }

    let payload: JwtPayload | null = null;
    try {
      payload = await verifyInternalJwt(legacyToken, requireInternalJwtSecret());
    } catch {
      payload = null;
    }
    if (!payload) return res.status(401).json({ code: "AUTH_INVALID", error: "Invalid session" });
    const user = await loadValidUser(payload);
    if (!user) return res.status(401).json({ code: "AUTH_REVOKED", error: "Session revoked" });

    const tenantId = await validatedTenantId(payload, user.id);
    const rotated = generateToken({ id: user.id, email: user.email, tenantId });
    setSessionCookie(res, rotated);
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        is_owner: isOwnerEmail(user.email),
        tenant_id: tenantId,
      },
    });
  },
);

router.post("/api/auth/signout", async (req: Request, res: Response) => {
  const token = getSessionTokenFromRequest(req);
  clearSessionCookie(res);
  if (!token) return res.json({ success: true });

  try {
    const payload = await verifyInternalJwt(token, requireInternalJwtSecret());
    if (payload?.sub) {
      const user = await loadValidUser(payload);
      if (user) {
        await tenantStore.run(user.id, async () => {
          await drizzle
            .update(sessionUsers)
            .set({ sessionRevokedBefore: new Date() })
            .where(eq(sessionUsers.id, user.id));
        });
      }
    }
  } catch {
    // A malformed/expired token still gets its cookie cleared. There is no
    // authenticated session left to revoke server-side.
  }
  return res.json({ success: true });
});

export default router;
