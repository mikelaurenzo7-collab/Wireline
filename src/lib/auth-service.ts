import { randomBytes, scryptSync, createHmac, timingSafeEqual, createHash } from "node:crypto";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { and, eq, gte, isNull } from "drizzle-orm";

// Use INTERNAL_JWT_SECRET (preferred) or fall back to SUPABASE_JWT_SECRET for backward compatibility
const SECRET = process.env.INTERNAL_JWT_SECRET || process.env.SUPABASE_JWT_SECRET;

// Enforce JWT secret configuration - no weak fallbacks for production security
if (!SECRET) {
  throw new Error(
    "JWT_SECRET_NOT_CONFIGURED: INTERNAL_JWT_SECRET or SUPABASE_JWT_SECRET must be set. " +
      "In development, use a secure random string (at least 32 characters). " +
      "In production, this is a critical security requirement.",
  );
}

// Validate minimum secret length for security
if (SECRET.length < 32) {
  log.warn("JWT secret is less than 32 characters - this may compromise token security");
}

/**
 * Hash a password using scrypt.
 * Format: salt:hash
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const key = scryptSync(password, salt, 64);
  return timingSafeEqual(Buffer.from(hash, "hex"), key);
}

/**
 * Generate a JWT for a user.
 * This is a lightweight implementation to avoid external dependencies.
 */
export function generateToken(user: { id: string; email: string }): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    iat: now,
    exp: now + 60 * 60 * 24 * 7, // 7 days
    aud: "authenticated",
    role: "authenticated",
    iss: "wireline-internal",
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signature = createHmac("sha256", SECRET)
    .update(`${base64Header}.${base64Payload}`)
    .digest("base64url");

  return `${base64Header}.${base64Payload}.${signature}`;
}

/**
 * Auth Service: High-level operations for user management.
 */
export const authService = {
  async signIn(email: string, password: string) {
    const [user] = await drizzle
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (!user || !user.passwordHash) {
      log.warn("Auth: User not found or no password set", { email });
      return null;
    }

    if (!verifyPassword(password, user.passwordHash)) {
      log.warn("Auth: Invalid password", { email });
      return null;
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
      },
      token: generateToken({ id: user.id, email: user.email }),
    };
  },

  async signUp(email: string, password: string, fullName?: string) {
    const passwordHash = hashPassword(password);

    try {
      const inserted = (await drizzle
        .insert(schema.users)
        .values({
          email,
          passwordHash,
          fullName,
        })
        .returning()) as Array<{ id: string; email: string; fullName: string | null }>;
      const user = inserted[0];

      // Soft 14-day trial starts here. Failures don't block signup —
      // the sweep job will fix up any stragglers.
      const { startTrialForUser } = await import("./trial-gate");
      await startTrialForUser(user.id);

      return {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.fullName,
        },
        token: generateToken({ id: user.id, email: user.email }),
      };
    } catch (err: any) {
      log.error("Auth: Sign up failed", { email, error: err.message });
      throw err;
    }
  },

  /**
   * Mint a single-use email-verification token for the given user.
   * Mirrors createPasswordResetToken's hashed-storage pattern — only
   * the sha256 hash hits the DB; the plaintext is returned to the
   * caller so the route handler can email it. 24-hour TTL.
   */
  async createEmailVerificationToken(userId: string) {
    const plaintext = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(plaintext).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    await drizzle.insert(schema.emailVerificationTokens).values({
      userId,
      tokenHash,
      expiresAt,
    });
    return { token: plaintext, expiresAt };
  },

  /**
   * Consume an email-verification token. Validates hash, TTL, and
   * unused state in a single round-trip, then marks the user as
   * verified and the token as used. Returns the user id on success
   * so the route can issue a fresh session JWT. Null on any failure
   * (bad hash, expired, already used) so the route returns a generic
   * "this link is no longer valid" error without leaking which case.
   */
  async completeEmailVerification(token: string) {
    if (!token) return null;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [row] = await drizzle
      .select({
        id: schema.emailVerificationTokens.id,
        userId: schema.emailVerificationTokens.userId,
        expiresAt: schema.emailVerificationTokens.expiresAt,
        usedAt: schema.emailVerificationTokens.usedAt,
      })
      .from(schema.emailVerificationTokens)
      .where(eq(schema.emailVerificationTokens.tokenHash, tokenHash))
      .limit(1);
    if (!row || row.usedAt || row.expiresAt < new Date()) return null;

    await drizzle
      .update(schema.users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, row.userId));
    await drizzle
      .update(schema.emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(schema.emailVerificationTokens.id, row.id));

    const [user] = await drizzle
      .select({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName })
      .from(schema.users)
      .where(eq(schema.users.id, row.userId))
      .limit(1);
    return user;
  },

  /**
   * Issue a single-use password-reset token for the given email. The plaintext
   * token is returned to the caller (so the route handler can email or log it)
   * but only the sha256 hash is persisted — a DB leak doesn't allow account
   * takeover. Returns null when the email isn't in the system so the caller
   * can no-op silently to prevent enumeration.
   */
  async createPasswordResetToken(email: string, requestedIp?: string) {
    const [user] = await drizzle
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (!user) return null;

    const plaintext = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(plaintext).digest("hex");
    // 1-hour TTL — mailbox delays (Gmail throttling, corp filters) can
    // push 15-minute tokens over the edge in transit. 1 hour gives a
    // comfortable safety margin while still being short enough that
    // stolen email forensics matter.
    const expiresAt = new Date(Date.now() + 60 * 60_000);

    await drizzle.insert(schema.passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
      requestedIp: requestedIp || null,
    });

    return { token: plaintext, userId: user.id, expiresAt };
  },

  /**
   * Consume a password-reset token: verify hash, TTL, and unused status; rehash
   * the new password; mark the token used. Returns the freshly authenticated
   * user + JWT on success, null on any failure (expired, used, not found).
   */
  async completePasswordReset(token: string, newPassword: string) {
    if (!token || !newPassword || newPassword.length < 8) return null;

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = new Date();

    const [row] = await drizzle
      .select()
      .from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.tokenHash, tokenHash),
          gte(schema.passwordResetTokens.expiresAt, now),
          isNull(schema.passwordResetTokens.usedAt),
        ),
      )
      .limit(1);
    if (!row) return null;

    const newHash = hashPassword(newPassword);
    // Wrap password update + token mark-used in a single transaction so
    // we can never leave a "password rotated but token still consumable"
    // state (replay window) or "token marked used but password not
    // rotated" state (user locked out). Same defense-in-depth rationale
    // as the audit3 hotfix on tenant demo backfill.
    await drizzle.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({ passwordHash: newHash, updatedAt: now })
        .where(eq(schema.users.id, row.userId));
      await tx
        .update(schema.passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(schema.passwordResetTokens.id, row.id));
    });

    const [user] = await drizzle
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, row.userId))
      .limit(1);
    if (!user) return null;

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
      },
      token: generateToken({ id: user.id, email: user.email }),
    };
  },
};
