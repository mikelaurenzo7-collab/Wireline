/**
 * Demo-line acquisition funnel — attribute, record, recap, convert.
 */
import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { BOTBOUND_PRODUCTION_ORIGIN, LEGACY_PRODUCTION_ORIGIN } from "./brand";
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
      BOTBOUND_PRODUCTION_ORIGIN,
      LEGACY_PRODUCTION_ORIGIN,
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
      subject: `Your BotBound demo with ${args.agentName}`,
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
