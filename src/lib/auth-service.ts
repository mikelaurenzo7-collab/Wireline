/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import {
  randomBytes,
  scrypt,
  scryptSync,
  createHmac,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { drizzle, log, tenantStore } from "./server-context";
import * as schema from "../db/schema";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { requireInternalJwtSecret } from "./internal-jwt-secret";
import { verifyInternalJwt, type JwtPayload } from "./auth-utils";
import { assertPasswordIsSafe, type PasswordBreachCheckContext } from "./breached-passwords";
export {
  getOwnerEmails,
  resetOwnerEmailCacheForTests,
  isOwnerEmail,
} from "./platform-owner-emails";
import { isOwnerEmail } from "./platform-owner-emails";

const scryptAsync = promisify(scrypt);
export const MAX_PASSWORD_BYTES = 256;

/** Lazy so importing auth-service does not crash the whole API when env is misconfigured. */
let cachedJwtSecret: string | null = null;

function getJwtSecret(): string {
  if (!cachedJwtSecret) {
    cachedJwtSecret = requireInternalJwtSecret();
    if (cachedJwtSecret.length < 32) {
      log.warn("JWT secret is less than 32 characters - this may compromise token security");
    }
  }
  return cachedJwtSecret;
}

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

function passwordFitsBound(password: string): boolean {
  return Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES;
}

function requireBoundedPassword(password: string): void {
  if (!passwordFitsBound(password)) {
    throw new Error(`PASSWORD_TOO_LONG: passwords are limited to ${MAX_PASSWORD_BYTES} UTF-8 bytes`);
  }
}

async function requirePasswordSafety(
  password: string,
  context: PasswordBreachCheckContext,
): Promise<void> {
  requireBoundedPassword(password);
  const result = await assertPasswordIsSafe(password, { context });
  if (!result.checked && result.error) {
    log.warn("Auth: password breach check unavailable in permissive mode", {
      context,
      error: result.error,
    });
  }
}

/**
 * Compatibility helper for tests and offline scripts. Public authentication
 * paths use the asynchronous variant below so scrypt never blocks the event loop.
 */
export function hashPassword(password: string): string {
  requireBoundedPassword(password);
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function hashPasswordForRequest(password: string): Promise<string> {
  requireBoundedPassword(password);
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${Buffer.from(key).toString("hex")}`;
}

/** Compatibility helper; request handlers use verifyPasswordForRequest. */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!passwordFitsBound(password)) return false;
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const key = scryptSync(password, salt, 64);
  const hashBuf = Buffer.from(hash, "hex");
  if (hashBuf.length !== key.length) return false;
  return timingSafeEqual(hashBuf, key);
}

async function verifyPasswordForRequest(password: string, storedHash: string): Promise<boolean> {
  if (!passwordFitsBound(password)) return false;
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const key = Buffer.from((await scryptAsync(password, salt, 64)) as Buffer);
  const hashBuf = Buffer.from(hash, "hex");
  if (hashBuf.length !== key.length) return false;
  return timingSafeEqual(hashBuf, key);
}

function authUserFlags(user: { id: string; email: string }) {
  return {
    is_owner: isOwnerEmail(user.email),
  };
}

/**
 * Generate a short-lived Wireline JWT. `iat_ms` gives session revocation
 * millisecond precision while preserving standard integer `iat` semantics.
 * `tenant_id` is present only when the user deliberately selected a shared
 * workspace whose membership was verified server-side.
 */
export function generateToken(user: {
  id: string;
  email: string;
  tenantId?: string | null;
}): string {
  const header = { alg: "HS256", typ: "JWT" };
  const nowMs = Date.now();
  const now = Math.floor(nowMs / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    iat: now,
    iat_ms: nowMs,
    exp: now + 60 * 60 * 2,
    aud: "authenticated",
    role: "authenticated",
    iss: "wireline-internal",
    ...(user.tenantId && user.tenantId !== user.id ? { tenant_id: user.tenantId } : {}),
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signature = createHmac("sha256", getJwtSecret())
    .update(`${base64Header}.${base64Payload}`)
    .digest("base64url");

  return `${base64Header}.${base64Payload}.${signature}`;
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    return await verifyInternalJwt(token, getJwtSecret());
  } catch {
    return null;
  }
}

export const authService = {
  async signIn(email: string, password: string) {
    try {
      getJwtSecret();
    } catch (err) {
      log.error("Auth: JWT secret not configured", { error: err });
      throw new AuthConfigurationError(
        err instanceof Error ? err.message : "JWT_SECRET_NOT_CONFIGURED",
      );
    }

    const [user] = await drizzle
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (!user || !user.passwordHash) {
      log.warn("Auth: User not found or no password set", { email });
      return null;
    }

    if (!(await verifyPasswordForRequest(password, user.passwordHash))) {
      log.warn("Auth: Invalid password", { email });
      return null;
    }

    const [sub] = await drizzle
      .select({ plan: schema.subscriptions.plan })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, user.id))
      .limit(1);

    const { resolveAccountType } = await import("./account-type");
    const { ensureDefaultAccount } = await import("./account-service");
    const fallbackAccountType = resolveAccountType(sub?.plan);
    const account_type = (await ensureDefaultAccount(user.id, fallbackAccountType)).type;

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        ...authUserFlags(user),
        account_type,
      },
      token: generateToken({ id: user.id, email: user.email }),
    };
  },

  async signUp(
    email: string,
    password: string,
    fullName?: string,
    signupAttribution?: {
      preferredPlanId?: string | null;
      preferredBillingInterval?: "month" | "year" | null;
      signupWedge?: string | null;
      utmSource?: string | null;
      utmMedium?: string | null;
      utmCampaign?: string | null;
    },
  ) {
    try {
      getJwtSecret();
    } catch (err) {
      log.error("Auth: JWT secret not configured", { error: err });
      throw new AuthConfigurationError(
        err instanceof Error ? err.message : "JWT_SECRET_NOT_CONFIGURED",
      );
    }

    await requirePasswordSafety(password, "signup");
    const passwordHash = await hashPasswordForRequest(password);

    return tenantStore.run("", async () => {
      try {
        return await drizzle.transaction(async (tx) => {
          const inserted = (await tx
            .insert(schema.users)
            .values({ email, passwordHash, fullName })
            .returning()) as Array<{ id: string; email: string; fullName: string | null }>;
          const user = inserted[0];

          const { startTrialForUser } = await import("./trial-gate");
          await startTrialForUser(user.id, signupAttribution, tx);

          const { resolveAccountType } = await import("./account-type");
          const account_type = resolveAccountType(signupAttribution?.preferredPlanId);
          await tx.insert(schema.accounts).values({
            userId: user.id,
            type: account_type,
            label: account_type === "personal" ? "Personal" : "My Business",
            isPrimary: true,
          });

          return {
            user: {
              id: user.id,
              email: user.email,
              full_name: user.fullName,
              ...authUserFlags(user),
              account_type,
            },
            token: generateToken({ id: user.id, email: user.email }),
          };
        });
      } catch (err: any) {
        log.error("Auth: Sign up failed", { email, error: err.message });
        throw err;
      }
    });
  },

  async createEmailVerificationToken(userId: string) {
    const plaintext = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(plaintext).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    await drizzle.insert(schema.emailVerificationTokens).values({ userId, tokenHash, expiresAt });
    return { token: plaintext, expiresAt };
  },

  async completeEmailVerification(token: string) {
    if (!token) return null;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = new Date();

    const userId = await drizzle.transaction(async (tx) => {
      const [claimed] = await tx
        .update(schema.emailVerificationTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(schema.emailVerificationTokens.tokenHash, tokenHash),
            gte(schema.emailVerificationTokens.expiresAt, now),
            isNull(schema.emailVerificationTokens.usedAt),
          ),
        )
        .returning({ userId: schema.emailVerificationTokens.userId });
      if (!claimed) return null;

      const [updated] = await tx
        .update(schema.users)
        .set({ emailVerifiedAt: now, updatedAt: now })
        .where(eq(schema.users.id, claimed.userId))
        .returning({ id: schema.users.id });
      return updated?.id ?? null;
    });
    if (!userId) return null;

    const [user] = await drizzle
      .select({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return user;
  },

  async createPasswordResetToken(email: string, requestedIp?: string) {
    const [user] = await drizzle
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (!user) return null;

    const plaintext = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(plaintext).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60_000);

    await drizzle.insert(schema.passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
      requestedIp: requestedIp || null,
    });

    return { token: plaintext, userId: user.id, expiresAt };
  },

  async completePasswordReset(token: string, newPassword: string) {
    if (!token || !newPassword || newPassword.length < 8) return null;

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = new Date();

    await requirePasswordSafety(newPassword, "reset");
    const newHash = await hashPasswordForRequest(newPassword);

    const userId = await drizzle.transaction(async (tx) => {
      const [claimed] = await tx
        .update(schema.passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(schema.passwordResetTokens.tokenHash, tokenHash),
            gte(schema.passwordResetTokens.expiresAt, now),
            isNull(schema.passwordResetTokens.usedAt),
          ),
        )
        .returning({ userId: schema.passwordResetTokens.userId });
      if (!claimed) return null;

      const changed = (await tx.execute(sql`
        UPDATE wireline_users
        SET password_hash = ${newHash},
            session_revoked_before = clock_timestamp(),
            updated_at = ${now}
        WHERE id = ${claimed.userId}
        RETURNING id
      `)) as unknown as { rows?: Array<{ id: string }> };
      return changed.rows?.[0]?.id ?? null;
    });
    if (!userId) return null;

    const [user] = await drizzle
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user) return null;

    const [sub] = await drizzle
      .select({ plan: schema.subscriptions.plan })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, user.id))
      .limit(1);

    const { resolveAccountType } = await import("./account-type");
    const { ensureDefaultAccount } = await import("./account-service");
    const fallbackAccountType = resolveAccountType(sub?.plan);
    const account_type = (await ensureDefaultAccount(user.id, fallbackAccountType)).type;

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        ...authUserFlags(user),
        account_type,
      },
      token: generateToken({ id: user.id, email: user.email }),
    };
  },
};
