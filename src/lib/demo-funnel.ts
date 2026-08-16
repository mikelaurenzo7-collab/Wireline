/**
 * Demo-line acquisition funnel — attribute, record, recap, convert.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS } from "../data/contact-agents";
export { DEMO_SOURCE_COOKIE, parseDemoSourceFromQuery } from "./demo-funnel-shared";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function validateDemoRecapUrl(rawUrl: string): string {
  const allowed = new Set(
    [
      process.env.APP_URL,
      process.env.PUBLIC_APP_URL,
      process.env.VITE_APP_URL,
      "https://trywireline.com",
    ]
      .filter(Boolean)
      .map((url) => new URL(url as string).origin),
  );
  const parsed = new URL(rawUrl);
  if (!["https:", "http:"].includes(parsed.protocol) || !allowed.has(parsed.origin)) {
    throw new Error("Invalid demo recap signup URL");
  }
  return parsed.toString();
}

export function hashCallerNumber(number: string | null | undefined): string | null {
  if (!number) return null;
  const digits = number.replace(/\D/g, "").slice(-10);
  if (digits.length < 10) return null;
  return createHash("sha256").update(digits).digest("hex").slice(0, 32);
}

export function resolveShowcaseAgentByNumber(dialedNumber: string | null): string | null {
  if (!dialedNumber) return null;
  const digits = dialedNumber.replace(/\D/g, "").slice(-10);
  const all = [...WIRELINE_CONTACT_AGENTS, ...WIRELINE_DEMO_AGENTS];
  const match = all.find((a) => a.tel.replace(/\D/g, "").slice(-10) === digits);
  return match?.name ?? null;
}

export async function recordDemoCallEvent(args: {
  dialedNumber: string;
  showcaseAgent?: string | null;
  callerNumber?: string | null;
  source?: string | null;
  intentVertical?: string | null;
  vapiCallId?: string | null;
  callLogId?: bigint | null;
}): Promise<bigint | null> {
  try {
    const inserted = await drizzle
      .insert(schema.demoCallEvents)
      .values({
        dialedNumber: args.dialedNumber,
        showcaseAgent: args.showcaseAgent ?? resolveShowcaseAgentByNumber(args.dialedNumber),
        callerNumberHash: hashCallerNumber(args.callerNumber),
        source: args.source ?? "direct",
        intentVertical: args.intentVertical ?? null,
        vapiCallId: args.vapiCallId ?? null,
        callLogId: args.callLogId ?? null,
      })
      .returning({ id: schema.demoCallEvents.id });
    return inserted[0]?.id ?? null;
  } catch (err: unknown) {
    log.warn("recordDemoCallEvent failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function classifyDemoIntent(
  summary: string | null,
  agentName: string | null,
): string | null {
  const text = `${summary ?? ""} ${agentName ?? ""}`.toLowerCase();
  const wedges = ["hvac", "dental", "legal", "real estate", "insurance", "saas", "home services"];
  for (const w of wedges) {
    if (text.includes(w.replace(" ", "")) || text.includes(w)) return w;
  }
  void agentName;
  return null;
}

export function extractEmailFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.toLowerCase() ?? null;
}

/** Link the most recent open demo event to a new signup (cookie or ?demo= attribution). */
export async function attributeDemoSignup(
  userId: string,
  demoSource: string | null | undefined,
): Promise<void> {
  if (!demoSource) return;
  const since = new Date(Date.now() - 14 * 24 * 60 * 60_000);
  const agentName = demoSource.startsWith("landing:") ? demoSource.slice(8) : null;
  try {
    const matchSource = eq(schema.demoCallEvents.source, demoSource);
    const matchAgent =
      agentName != null
        ? sql`lower(${schema.demoCallEvents.showcaseAgent}) = lower(${agentName})`
        : undefined;
    const [row] = await drizzle
      .select({ id: schema.demoCallEvents.id })
      .from(schema.demoCallEvents)
      .where(
        and(
          isNull(schema.demoCallEvents.signupUserId),
          gte(schema.demoCallEvents.createdAt, since),
          matchAgent ? or(matchSource, matchAgent) : matchSource,
        ),
      )
      .orderBy(desc(schema.demoCallEvents.createdAt))
      .limit(1);
    if (row?.id) await linkDemoSignup(row.id, userId);
  } catch (err: unknown) {
    log.warn("attributeDemoSignup failed", {
      userId,
      demoSource,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function markDemoRecapSent(eventId: bigint): Promise<void> {
  await drizzle
    .update(schema.demoCallEvents)
    .set({ recapSentAt: new Date() })
    .where(eq(schema.demoCallEvents.id, eventId));
}

export async function linkDemoSignup(eventId: bigint, userId: string): Promise<void> {
  await drizzle
    .update(schema.demoCallEvents)
    .set({ signupUserId: userId })
    .where(eq(schema.demoCallEvents.id, eventId));
}

/**
 * Recap + signup prompt for someone who called the public demo line.
 *
 * This is commercial email to a non-customer: the address is scraped out of the
 * call summary, the recipient has no Wireline account, and the body's purpose is
 * to convert them. It therefore carries the same CAN-SPAM / bulk-sender
 * treatment as the trial-ending upsell — honor the suppression list, RFC 8058
 * one-click unsubscribe headers, a working unsubscribe link, and a physical
 * postal address — rather than the transactional exemption the rest of this
 * module's mail relies on.
 *
 * Fails closed when `WIRELINE_POSTAL_ADDRESS` is unset: sending a commercial
 * email with no postal address is the violation, so no send is the safe outcome.
 */
export async function sendDemoRecapEmail(args: {
  to: string;
  agentName: string;
  summary: string;
  signupUrl: string;
}): Promise<boolean> {
  try {
    const { sendEmail } = await import("./email-service");
    const {
      buildComplianceFooterHtml,
      buildComplianceFooterText,
      buildListUnsubscribeHeaders,
      getPostalAddress,
      isEmailSuppressed,
    } = await import("./email-compliance");

    if (!getPostalAddress()) {
      log.warn("demo recap email skipped, WIRELINE_POSTAL_ADDRESS is not configured");
      return false;
    }
    if (await isEmailSuppressed(args.to)) {
      log.info("demo recap email skipped, recipient is suppressed");
      return false;
    }

    const safeSummary = escapeHtml(args.summary);
    const safeSignupUrl = escapeHtml(validateDemoRecapUrl(args.signupUrl));
    const result = await sendEmail({
      to: args.to,
      subject: `Your Wireline demo with ${args.agentName}`,
      text:
        [
          "Thanks for calling our live demo line.",
          "",
          `What we discussed: ${args.summary}`,
          "",
          `Create your agent: ${args.signupUrl}`,
        ].join("\n") + buildComplianceFooterText(args.to, "demo_line_recap"),
      html: `<p>Thanks for calling our live demo line.</p>
<p><strong>What we discussed:</strong> ${safeSummary}</p>
<p><a href="${safeSignupUrl}">Create your agent</a> - we'll pre-load a starting brief matched to your use case.</p>
${buildComplianceFooterHtml(args.to, "demo_line_recap")}`,
      headers: buildListUnsubscribeHeaders(args.to),
    });
    return result.ok;
  } catch {
    return false;
  }
}
