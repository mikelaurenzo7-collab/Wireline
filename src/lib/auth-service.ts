import { randomBytes, scryptSync, createHmac, timingSafeEqual } from "node:crypto";
import { drizzle, log, requireSecret } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

const SECRET = requireSecret(
  "INTERNAL_JWT_SECRET",
  "development-secret-key-at-least-32-chars-long",
);

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
    iss: "wireline-internal"
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
        full_name: user.fullName
      },
      token: generateToken({ id: user.id, email: user.email })
    };
  },

  async signUp(email: string, password: string, fullName?: string) {
    const passwordHash = hashPassword(password);
    
    try {
      const [user] = await drizzle
        .insert(schema.users)
        .values({
          email,
          passwordHash,
          fullName
        })
        .returning();

      return {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.fullName
        },
        token: generateToken({ id: user.id, email: user.email })
      };
    } catch (err: any) {
      log.error("Auth: Sign up failed", { email, error: err.message });
      throw err;
    }
  }
};
