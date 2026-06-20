/**
 * Clerk → Wireline session bridge.
 *
 * Clerk handles all sign-in surfaces (social, Apple, phone OTP, passkeys, MFA).
 * Integration mailbox OAuth stays on /api/oauth/* with your existing provider keys.
 * Stripe billing is unchanged — subscriptions remain on wireline_users.id.
 */
import { Router, type Request, type Response } from "express";
import { verifyToken } from "@clerk/backend";
import { Webhook } from "svix";
import { eq } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { generateToken } from "../lib/auth-service";
import { authSuccessBody, setSessionCookie } from "../lib/session-cookie";
import { scheduleFounderBootstrap } from "../lib/founder-bootstrap";
import { findOrCreateUserFromClerkIdentity } from "../lib/clerk-user-bridge";
import { getClerkClient, isClerkConfigured } from "../lib/clerk-server";
import { signinRateLimiter } from "../middleware/rate-limit-middleware";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";

const router = Router();

function clerkUnavailable(res: Response) {
  return res.status(503).json({
    error: "Clerk sign-in is not configured. Set CLERK_SECRET_KEY and VITE_CLERK_PUBLISHABLE_KEY.",
    code: "CLERK_NOT_CONFIGURED",
  });
}

function readBearerToken(req: Request): string | null {
  const header = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

async function resolveClerkUserId(sessionToken: string): Promise<string> {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not configured");

  const payload = await verifyToken(sessionToken, { secretKey });
  const userId = typeof payload.sub === "string" ? payload.sub : null;
  if (!userId) throw AppError.fromHttpStatus(401, "Invalid Clerk session");
  return userId;
}

async function bridgeClerkUserToWireline(clerkUserId: string) {
  const clerk = getClerkClient();
  const clerkUser = await clerk.users.getUser(clerkUserId);
  const primary =
    clerkUser.emailAddresses.find((row) => row.id === clerkUser.primaryEmailAddressId) ??
    clerkUser.emailAddresses[0];
  const email = primary?.emailAddress?.trim();
  if (!email) {
    throw AppError.fromHttpStatus(400, "Clerk account has no email. Add an email to continue.");
  }

  const fullName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() || null;
  const emailVerified =
    primary?.verification?.status === "verified" ||
    clerkUser.emailAddresses.some((row) => row.verification?.status === "verified");

  const user = await findOrCreateUserFromClerkIdentity({
    email,
    fullName,
    avatarUrl: clerkUser.imageUrl,
    emailVerified,
  });

  return user;
}

/**
 * POST /api/auth/clerk/bridge
 *
 * Verifies a Clerk session JWT, upserts wireline_users, issues wireline_session.
 */
router.post("/api/auth/clerk/bridge", signinRateLimiter, async (req: Request, res: Response) => {
  if (!isClerkConfigured()) return clerkUnavailable(res);

  const sessionToken = readBearerToken(req);
  if (!sessionToken) {
    return res.status(401).json({
      error: "Missing Clerk session token. Send Authorization: Bearer <clerk-session-jwt>.",
      code: "CLERK_TOKEN_REQUIRED",
    });
  }

  try {
    const clerkUserId = await resolveClerkUserId(sessionToken);
    const user = await bridgeClerkUserToWireline(clerkUserId);
    const token = generateToken({ id: user.id, email: user.email });
    setSessionCookie(res, token);
    scheduleFounderBootstrap(user.id, user.email);
    return res.json(authSuccessBody(user));
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.warn("clerk bridge failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw AppError.fromHttpStatus(401, "Invalid or expired Clerk session");
  }
});

type ClerkWebhookEvent = {
  type: string;
  data: {
    id?: string;
    email_addresses?: Array<{
      id?: string;
      email_address?: string;
      verification?: { status?: string };
    }>;
    primary_email_address_id?: string;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
};

/**
 * POST /api/auth/clerk/webhook
 *
 * Keeps wireline_users in sync when profiles change in Clerk (avatar, verified email).
 */
router.post("/api/auth/clerk/webhook", async (req: Request, res: Response) => {
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim();
  if (!signingSecret) {
    return res
      .status(503)
      .json({
        code: "SERVICE_UNAVAILABLE",
        error: "CLERK_WEBHOOK_SIGNING_SECRET is not configured",
      });
  }

  const payload = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body ?? {});
  const headers = {
    "svix-id": String(req.headers["svix-id"] ?? ""),
    "svix-timestamp": String(req.headers["svix-timestamp"] ?? ""),
    "svix-signature": String(req.headers["svix-signature"] ?? ""),
  };

  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(signingSecret);
    event = wh.verify(payload, headers) as ClerkWebhookEvent;
  } catch (error) {
    log.warn("clerk webhook signature verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(400).json({ code: "BAD_REQUEST", error: "Invalid webhook signature" });
  }

  if (event.type !== "user.updated" && event.type !== "user.created") {
    return res.json({ ok: true, ignored: event.type });
  }

  const data = event.data;
  const primary =
    data.email_addresses?.find((row) => row.id === data.primary_email_address_id) ??
    data.email_addresses?.[0];
  const email = primary?.email_address?.trim().toLowerCase();
  if (!email) return res.json({ ok: true, skipped: "no_email" });

  const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || null;
  const emailVerified =
    primary?.verification?.status === "verified" ||
    (data.email_addresses ?? []).some((row) => row.verification?.status === "verified");

  try {
    await findOrCreateUserFromClerkIdentity({
      email,
      fullName,
      avatarUrl: data.image_url,
      emailVerified,
    });

    if (emailVerified) {
      await drizzle
        .update(schema.users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(schema.users.email, email));
    }
  } catch (error) {
    log.error("clerk webhook user sync failed", {
      error: error instanceof Error ? error.message : String(error),
      clerkUserId: data.id,
    });
    return res.status(500).json({ code: "INTERNAL_ERROR", error: "User sync failed" });
  }

  return res.json({ ok: true });
});

export default router;
