import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { env, getRequiredEnv, isProductionEnv } from "./env";
import { AppError } from "./errors";
import { db } from "./supabase";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email?: string } & Record<string, unknown>;
}

export function getBearerToken(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

export async function getAuthenticatedUser(req: Request) {
  const token = getBearerToken(req);
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function authenticateUser(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const user = await getAuthenticatedUser(req);
  if (!user) return next(AppError.unauthorized("Invalid or expired session"));
  req.user = user as unknown as AuthenticatedRequest["user"];
  next();
}

// ---------- OAuth state token ----------

function getOAuthStateSecret() {
  // Phase 1 hardening: in production, require a dedicated secret. In dev we
  // tolerate falling back to GOOGLE_CLIENT_SECRET.
  if (isProductionEnv()) {
    return getRequiredEnv("OAUTH_STATE_SECRET");
  }
  return env.OAUTH_STATE_SECRET?.trim() || env.GOOGLE_CLIENT_SECRET?.trim() || "dev-oauth-secret";
}

export function createOAuthState(userId: string, origin: string) {
  const payload = Buffer.from(
    JSON.stringify({ userId, origin, issuedAt: Date.now() })
  ).toString("base64url");
  const signature = createHmac("sha256", getOAuthStateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", getOAuthStateSecret()).update(payload).digest();
  const provided = Buffer.from(signature, "base64url");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  let decoded: { userId?: string; origin?: string; issuedAt?: number };
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!decoded.userId || !decoded.origin || !decoded.issuedAt) return null;
  if (Date.now() - decoded.issuedAt > 15 * 60 * 1000) return null;

  return decoded as { userId: string; origin: string; issuedAt: number };
}

// ---------- Vapi webhook secret ----------

export function hasValidWebhookSecret(req: Request) {
  const configuredSecret = env.WIRELINE_WEBHOOK_SECRET?.trim();
  if (!configuredSecret) return false;

  const providedSecret = req.get("x-vapi-secret")?.trim();
  if (!providedSecret) return false;

  const expected = Buffer.from(configuredSecret);
  const provided = Buffer.from(providedSecret);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
