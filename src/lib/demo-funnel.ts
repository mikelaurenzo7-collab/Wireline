/**
 * Demo-line acquisition funnel — attribute, record, recap, convert.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS } from "../data/contact-agents";
export { DEMO_SOURCE_COOKIE, parseDemoSourceFromQuery } from "./demo-funnel-shared";

export function hashCallerNumber(number: string | null | undefined): string | null {
  if (!number) return null;
  const digits = number.replace(/\D/g, "");
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

export async function sendDemoRecapEmail(args: {
  to: string;
  agentName: string;
  summary: string;
  signupUrl: string;
}): Promise<boolean> {
  try {
    const { sendEmail } = await import("./email-service");
    const result = await sendEmail({
      to: args.to,
      subject: `Your Wireline demo with ${args.agentName}`,
      html: `<p>Thanks for calling our live demo line.</p>
<p><strong>What we discussed:</strong> ${args.summary}</p>
<p><a href="${args.signupUrl}">Start your free trial</a> — we'll pre-load a starter agent matched to your use case.</p>`,
    });
    return result.ok;
  } catch {
    return false;
  }
}
