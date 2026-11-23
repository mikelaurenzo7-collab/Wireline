import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { readCompanyIdentityPreferences } from "./company-identity";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/**
 * A HELP reply names the business that owns the line and how to reach it.
 * Each customer business texts under its own carrier campaign, so a reply that
 * named BotBound on a customer's line would contradict that registration.
 * Without saved identity details the reply keeps BotBound's platform wording.
 */
export type SmsHelpIdentity = { brandName: string | null; supportEmail: string | null };

const PLATFORM_HELP_IDENTITY = { brandName: "BotBound", supportEmail: "support@botbound.app" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BRAND_LENGTH = 40;

export function smsHelpReplyText(identity: Partial<SmsHelpIdentity> = {}): string {
  const ownBrand = String(identity.brandName || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_BRAND_LENGTH)
    .trim();
  const email = String(identity.supportEmail || "").trim();
  const brand = ownBrand || PLATFORM_HELP_IDENTITY.brandName;
  // Never pair a customer's brand with BotBound's inbox: without the owner's
  // own support email, point to the line itself (replies reach their Inbox).
  const contact = EMAIL.test(email)
    ? `Contact ${email} for support.`
    : ownBrand
      ? "Reply to this message for support."
      : `Contact ${PLATFORM_HELP_IDENTITY.supportEmail} for support.`;
  return `${brand} SMS help: reply STOP to opt out or START to opt back in. ${contact} Message and data rates may apply.`;
}

/** Read the line owner's brand and support email. Any read failure keeps the platform wording. */
export async function loadSmsHelpIdentity(userId: string): Promise<SmsHelpIdentity> {
  try {
    const [[settings], [preferences]] = await Promise.all([
      drizzle
        .select({
          brandName: schema.settings.brandName,
          businessName: schema.settings.businessName,
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
    const stored = (preferences?.preferences ?? {}) as Record<string, unknown>;
    const company = readCompanyIdentityPreferences(stored.company_identity);
    return {
      brandName: settings?.brandName?.trim() || settings?.businessName?.trim() || null,
      supportEmail: company.supportEmail,
    };
  } catch (error) {
    log.warn("SMS HELP identity unavailable; using platform wording", {
      error: getErrorMessage(error),
    });
    return { brandName: null, supportEmail: null };
  }
}
