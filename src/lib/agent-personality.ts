/**
 * Composes the Bot's saved personality.
 *
 * BotBound runs one Bot, so there is no role personality to pick and no
 * template overlay to stack. Composition is now just the short shared brief,
 * the personal-posture addendum when the account is not a business, and
 * whatever the Account Holder wrote, with business tokens substituted.
 *
 * Substitution tokens:
 *   {{businessName}}        — settings.businessName, fallback "your business"
 *   {{businessType}}        — settings.businessType, fallback "your business"
 *   {{operatingHours}}      — settings.businessHours, fallback "regular business hours"
 *   {{escalationContact}}   — settings.escalationContact, fallback "our team"
 *   {{primaryProduct}}      — settings.primaryProduct, fallback "our offering"
 */
import { DEFAULT_BOT_PERSONALITY, PERSONAL_POSTURE_ADDENDUM } from "./agent-constants";

export const ACCOUNT_HOLDER_INSTRUCTIONS_HEADING = "## ACCOUNT HOLDER INSTRUCTIONS" as const;

export interface BusinessContext {
  businessName?: string | null;
  businessType?: string | null;
  operatingHours?: string | null;
  escalationContact?: string | null;
  primaryProduct?: string | null;
}

/**
 * Substitute {{businessName}}-style placeholders in any prompt or message with
 * values pulled from the Account Holder's settings row.
 *
 * Falls back to safe generic strings when a value is unset — never leaves a
 * literal "{{businessName}}" visible to a caller.
 */
export function substituteBusinessVariables(input: string, ctx: BusinessContext = {}): string {
  const fallbacks: Record<string, string> = {
    businessName: ctx.businessName?.trim() || "your business",
    businessType: ctx.businessType?.trim() || "your business",
    operatingHours: ctx.operatingHours?.trim() || "regular business hours",
    escalationContact: ctx.escalationContact?.trim() || "our team",
    primaryProduct: ctx.primaryProduct?.trim() || "our offering",
  };
  return input.replace(/\{\{(\w+)\}\}/g, (_, key) => fallbacks[key] ?? `{{${key}}}`);
}

/**
 * Compose the Bot's system prompt by stacking the shared baseline, the personal
 * posture when the account is not a business, and Account Holder guidance —
 * which is always subordinate to runtime safety and tool guardrails.
 */
export function composeAgentPersonality(opts: {
  isBusinessAgent: boolean;
  accountHolderCustom?: string | null;
  businessContext?: BusinessContext;
}): string {
  const parts: string[] = [DEFAULT_BOT_PERSONALITY];
  if (!opts.isBusinessAgent) parts.push(PERSONAL_POSTURE_ADDENDUM);
  if (opts.accountHolderCustom?.trim()) {
    parts.push(`${ACCOUNT_HOLDER_INSTRUCTIONS_HEADING}\n${opts.accountHolderCustom.trim()}`);
  }
  const combined = parts.join("\n\n");
  const substituted = substituteBusinessVariables(combined, opts.businessContext || {});

  // Personal accounts share the business token system. Their safe generic
  // subject is the principal, never the Bot and never "your business."
  return opts.isBusinessAgent
    ? substituted
    : substituted.replace(/\byour business\b/gi, "your principal");
}
