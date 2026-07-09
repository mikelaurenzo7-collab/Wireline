/**
 * Email compliance — CAN-SPAM + Gmail/Yahoo bulk-sender (Feb 2024) plumbing
 * for commercial / relationship-marketing email (e.g. the trial-ending
 * reminder). Transactional mail (password reset, email verification,
 * payment-failed) is exempt and deliberately does NOT use any of this.
 *
 * What this provides:
 *   - One-click unsubscribe tokens (HMAC-signed, tamper-proof, no DB lookup
 *     to validate). The email address is encoded IN the token.
 *   - RFC 8058 List-Unsubscribe + List-Unsubscribe-Post headers.
 *   - A compliant footer (working unsubscribe link + physical postal address,
 *     which CAN-SPAM requires in commercial email).
 *   - A suppression list (check before send, write on opt-out) so opt-outs
 *     are actually honored. Reads/writes are defensive: a not-yet-migrated DB
 *     degrades gracefully instead of throwing on the send path.
 *
 * The token-signing key is derived from WIRELINE_DATA_KEY (with domain
 * separation) so no new required secret is introduced; a stable dev fallback
 * keeps local/test flows working without the vault configured.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { isVaultConfigured, getDataKey } from "./secret-vault";
import { getErrorMessage } from "./server-utils";

const TOKEN_LABEL = "email-unsubscribe-v1";

function unsubKey(): string {
  // Derive a purpose-specific subkey (domain separation) so the unsubscribe
  // HMAC never reuses the raw data key directly. base64 of the data key keeps
  // the HMAC key a string, matching the codebase's createHmac usage. The
  // dev/test fallback is deterministic and never used when WIRELINE_DATA_KEY
  // is configured (i.e. never in production).
  const base = isVaultConfigured()
    ? getDataKey().toString("base64")
    : "wireline-dev-unsubscribe-secret";
  return createHmac("sha256", base).update(TOKEN_LABEL).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Sign a tamper-proof one-click unsubscribe token that encodes the email. */
export function signUnsubscribeToken(email: string): string {
  const payload = Buffer.from(normalizeEmail(email), "utf8").toString("base64url");
  const sig = createHmac("sha256", unsubKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** Verify an unsubscribe token; returns the (normalized) email or null. */
export function verifyUnsubscribeToken(token: string | undefined | null): string | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return null;

  const expected = createHmac("sha256", unsubKey()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const email = Buffer.from(payload, "base64url").toString("utf8");
    return email ? normalizeEmail(email) : null;
  } catch {
    return null;
  }
}

function appBase(): string {
  return (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
}

export function unsubscribeUrl(email: string): string {
  const token = signUnsubscribeToken(email);
  return `${appBase()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

function unsubscribeMailto(): string {
  return (process.env.WIRELINE_UNSUBSCRIBE_MAILTO || "unsubscribe@trywireline.com").trim();
}

/**
 * RFC 8058 List-Unsubscribe headers. The HTTPS URL gives mailbox providers a
 * one-click button; the mailto is the fallback. List-Unsubscribe-Post signals
 * true one-click support (no landing page / confirmation required).
 */
export function buildListUnsubscribeHeaders(email: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(email)}>, <mailto:${unsubscribeMailto()}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** Physical postal address required in commercial email. Null when unset. */
export function getPostalAddress(): string | null {
  const a = (process.env.WIRELINE_POSTAL_ADDRESS || "").trim();
  return a || null;
}

/** Plain-text compliance footer (unsubscribe link + postal address). */
export function buildComplianceFooterText(email: string): string {
  const lines = [
    "",
    "—",
    `You're receiving this because you have a Wireline account (${normalizeEmail(email)}).`,
    `Unsubscribe from product & billing reminders: ${unsubscribeUrl(email)}`,
  ];
  const addr = getPostalAddress();
  if (addr) lines.push(addr);
  return lines.join("\n");
}

/** HTML compliance footer matching the email design system. */
export function buildComplianceFooterHtml(email: string): string {
  const addr = getPostalAddress();
  const safeEmail = escapeBasicHtml(normalizeEmail(email));
  const safeUnsub = escapeBasicHtml(unsubscribeUrl(email));
  return `
    <hr style="border: 0; border-top: 1px solid rgba(0,0,0,0.06); margin: 28px 0 16px;" />
    <p style="margin: 0 0 6px; line-height: 1.5; color: #9A9AA8; font-size: 11px;">
      You're receiving this because you have a Wireline account (${safeEmail}).
      <a href="${safeUnsub}" style="color: #6B6B7A;">Unsubscribe</a> from product &amp; billing reminders.
    </p>
    ${addr ? `<p style="margin: 0; line-height: 1.5; color: #9A9AA8; font-size: 11px;">${escapeBasicHtml(addr)}</p>` : ""}
  `;
}

function escapeBasicHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * True when the recipient has opted out. Defensive: on any DB error (incl. a
 * not-yet-migrated suppression table) returns false so a transient issue
 * never blocks transactional-adjacent sends — opt-outs that DO exist are
 * still honored once the table is present.
 */
export async function isEmailSuppressed(email: string): Promise<boolean> {
  try {
    const [row] = await drizzle
      .select({ email: schema.emailSuppressions.email })
      .from(schema.emailSuppressions)
      .where(eq(schema.emailSuppressions.email, normalizeEmail(email)))
      .limit(1);
    return !!row;
  } catch (err) {
    log.warn("isEmailSuppressed check failed — treating as not suppressed", {
      error: getErrorMessage(err),
    });
    return false;
  }
}

/** Record an opt-out. Idempotent. Returns true on success. */
export async function recordEmailSuppression(
  email: string,
  reason = "user_unsubscribe",
): Promise<boolean> {
  try {
    await drizzle
      .insert(schema.emailSuppressions)
      .values({ email: normalizeEmail(email), reason })
      .onConflictDoNothing();
    return true;
  } catch (err) {
    log.error("recordEmailSuppression failed", { error: getErrorMessage(err) });
    return false;
  }
}
