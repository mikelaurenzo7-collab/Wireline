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
import { and, eq } from "drizzle-orm";
import { readCompanyIdentityPreferences } from "./company-identity";
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

function requirePostalAddress(): string {
  const address = getPostalAddress();
  if (!address) {
    throw new Error("WIRELINE_POSTAL_ADDRESS is required for commercial email");
  }
  return address;
}

/**
 * Why the recipient is being emailed. CAN-SPAM requires the footer to identify
 * the relationship truthfully, and not every commercial recipient is an account
 * holder — the demo line emails a prospect who asked for a recap and has no
 * Wireline account at all.
 */
export type ComplianceFooterAudience = "account" | "demo_line_recap";

function footerReasonText(audience: ComplianceFooterAudience, email: string): string {
  return audience === "demo_line_recap"
    ? `You're receiving this because you asked for a recap on Wireline's demo line (${email}).`
    : `You're receiving this because you have a Wireline account (${email}).`;
}

function footerUnsubscribeLabel(audience: ComplianceFooterAudience): string {
  return audience === "demo_line_recap" ? "these emails" : "product & billing reminders";
}

/** Plain-text compliance footer (unsubscribe link + postal address). */
export function buildComplianceFooterText(
  email: string,
  audience: ComplianceFooterAudience = "account",
): string {
  const lines = [
    "",
    "—",
    footerReasonText(audience, normalizeEmail(email)),
    `Unsubscribe from ${footerUnsubscribeLabel(audience)}: ${unsubscribeUrl(email)}`,
  ];
  lines.push(requirePostalAddress());
  return lines.join("\n");
}

/** HTML compliance footer matching the email design system. */
export function buildComplianceFooterHtml(
  email: string,
  audience: ComplianceFooterAudience = "account",
): string {
  const addr = requirePostalAddress();
  const safeUnsub = escapeBasicHtml(unsubscribeUrl(email));
  return `
    <hr style="border: 0; border-top: 1px solid rgba(0,0,0,0.06); margin: 28px 0 16px;" />
    <p style="margin: 0 0 6px; line-height: 1.5; color: #9A9AA8; font-size: 11px;">
      ${escapeBasicHtml(footerReasonText(audience, normalizeEmail(email)))}
      <a href="${safeUnsub}" style="color: #6B6B7A;">Unsubscribe</a> from ${escapeBasicHtml(footerUnsubscribeLabel(audience))}.
    </p>
    <p style="margin: 0; line-height: 1.5; color: #9A9AA8; font-size: 11px;">${escapeBasicHtml(addr)}</p>
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
 * True when the recipient has opted out. A lookup failure also returns true:
 * the only caller is commercial email, so uncertainty must fail closed rather
 * than risk contacting someone whose opt-out cannot currently be verified.
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
    log.error("isEmailSuppressed check failed — treating as suppressed", {
      error: getErrorMessage(err),
    });
    return true;
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

export type TenantMarketingIdentity = {
  senderName: string;
  physicalPostalAddress: string;
};

export type TenantUnsubscribeIdentity = {
  userId: string;
  email: string;
};

const TENANT_TOKEN_PREFIX = "t1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Tenant campaign opt-outs are deliberately separate from Wireline's product
 * email opt-outs. The sender under CAN-SPAM is the tenant whose mailbox and
 * business are represented, so the suppression key is (tenant, recipient).
 */
export function signTenantUnsubscribeToken(userId: string, email: string): string {
  if (!UUID_RE.test(userId)) throw new Error("A valid tenant id is required for marketing email.");
  const payload = Buffer.from(
    JSON.stringify({ v: 1, t: userId, e: normalizeEmail(email) }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", unsubKey())
    .update(`${TENANT_TOKEN_PREFIX}.${payload}`)
    .digest("base64url");
  return `${TENANT_TOKEN_PREFIX}.${payload}.${sig}`;
}

export function verifyTenantUnsubscribeToken(
  token: string | undefined | null,
): TenantUnsubscribeIdentity | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TENANT_TOKEN_PREFIX) return null;
  const [, payload, sig] = parts;
  const expected = createHmac("sha256", unsubKey())
    .update(`${TENANT_TOKEN_PREFIX}.${payload}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      v?: unknown;
      t?: unknown;
      e?: unknown;
    };
    if (
      decoded.v !== 1 ||
      typeof decoded.t !== "string" ||
      !UUID_RE.test(decoded.t) ||
      typeof decoded.e !== "string" ||
      !decoded.e.includes("@")
    ) {
      return null;
    }
    return { userId: decoded.t, email: normalizeEmail(decoded.e) };
  } catch {
    return null;
  }
}

export function tenantUnsubscribeUrl(userId: string, email: string): string {
  const token = signTenantUnsubscribeToken(userId, email);
  return `${appBase()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function buildTenantListUnsubscribeHeaders(
  userId: string,
  email: string,
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${tenantUnsubscribeUrl(userId, email)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function buildTenantComplianceFooterText(args: {
  userId: string;
  email: string;
  identity: TenantMarketingIdentity;
}): string {
  return [
    "",
    "—",
    `Marketing message from ${args.identity.senderName}.`,
    `Unsubscribe from future marketing email from ${args.identity.senderName}: ${tenantUnsubscribeUrl(args.userId, args.email)}`,
    args.identity.physicalPostalAddress,
  ].join("\n");
}

export function buildTenantComplianceFooterHtml(args: {
  userId: string;
  email: string;
  identity: TenantMarketingIdentity;
}): string {
  const sender = escapeBasicHtml(args.identity.senderName);
  const addr = escapeBasicHtml(args.identity.physicalPostalAddress);
  const unsub = escapeBasicHtml(tenantUnsubscribeUrl(args.userId, args.email));
  return `
    <hr style="border: 0; border-top: 1px solid rgba(0,0,0,0.06); margin: 28px 0 16px;" />
    <p style="margin: 0 0 6px; line-height: 1.5; color: #6B6B7A; font-size: 11px;">
      Marketing message from ${sender}.
      <a href="${unsub}" style="color: #6B6B7A;">Unsubscribe</a> from future marketing email from ${sender}.
    </p>
    <p style="margin: 0; line-height: 1.5; color: #6B6B7A; font-size: 11px;">${addr}</p>
  `;
}

/**
 * Resolve the tenant business facts needed for a lawful commercial message.
 * Missing or unreadable identity returns null so senders fail closed.
 */
export async function getTenantMarketingIdentity(
  userId: string,
): Promise<TenantMarketingIdentity | null> {
  try {
    const [settingsRows, preferenceRows] = await Promise.all([
      drizzle
        .select({
          businessName: schema.settings.businessName,
          brandName: schema.settings.brandName,
        })
        .from(schema.settings)
        .where(eq(schema.settings.userId, userId))
        .limit(1),
      drizzle
        .select({ preferences: schema.userPreferences.preferences })
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId))
        .limit(1),
    ]);
    const settings = settingsRows[0];
    const envelope =
      preferenceRows[0]?.preferences &&
      typeof preferenceRows[0].preferences === "object" &&
      !Array.isArray(preferenceRows[0].preferences)
        ? (preferenceRows[0].preferences as Record<string, unknown>)
        : {};
    const identity = readCompanyIdentityPreferences(envelope.company_identity);
    const senderName = (settings?.brandName || settings?.businessName || "").trim();
    const physicalPostalAddress = (identity.physicalPostalAddress || "").trim();
    if (!senderName || !physicalPostalAddress) return null;
    return { senderName, physicalPostalAddress };
  } catch (err) {
    log.error("Tenant marketing identity check failed — suppressing send", {
      userId,
      error: getErrorMessage(err),
    });
    return null;
  }
}

export async function isTenantEmailSuppressed(userId: string, email: string): Promise<boolean> {
  try {
    const [row] = await drizzle
      .select({ id: schema.tenantEmailSuppressions.id })
      .from(schema.tenantEmailSuppressions)
      .where(
        and(
          eq(schema.tenantEmailSuppressions.userId, userId),
          eq(schema.tenantEmailSuppressions.email, normalizeEmail(email)),
        ),
      )
      .limit(1);
    return !!row;
  } catch (err) {
    log.error("Tenant email suppression check failed — treating as suppressed", {
      userId,
      error: getErrorMessage(err),
    });
    return true;
  }
}

export async function recordTenantEmailSuppression(
  userId: string,
  email: string,
  reason = "user_unsubscribe",
): Promise<boolean> {
  try {
    await drizzle
      .insert(schema.tenantEmailSuppressions)
      .values({ userId, email: normalizeEmail(email), reason })
      .onConflictDoNothing();
    return true;
  } catch (err) {
    // A token can outlive an account deletion. In that case there is no sender
    // left to suppress, so the already-erased tenant is equivalent to success.
    if ((err as { code?: string } | null)?.code === "23503") return true;
    log.error("recordTenantEmailSuppression failed", {
      userId,
      error: getErrorMessage(err),
    });
    return false;
  }
}
