import { and, desc, eq, gt, sql } from "drizzle-orm";

import { auditLog } from "../../db/schema";
import { drizzle, log } from "../server-context";

/**
 * One-shot fallback drills for launch checks, armed only by a platform admin.
 *
 * A drill makes the next inbound call to one BotBound number take a fallback
 * path without any env change or deploy:
 *  - `xai_connect`: skip the xAI leg, as if xAI never answered, so the call is
 *    answered on OpenAI Realtime by the dial-complete failover.
 *  - `xai_session`: answer on xAI, then fail the xAI session after the
 *    greeting so the live call is redirected to OpenAI mid-call.
 *  - `clone_voice`: answer with the cloned voice, then treat the clone as
 *    unavailable so the session swaps to the closest stock voice.
 *
 * Drills live in the audit log (who armed it, for which number, which mode),
 * expire after {@link DRILL_TTL_MS}, and are consumed atomically by the unique
 * (user, action, idempotency key) index, so one arm drives exactly one call.
 */
export const FALLBACK_DRILL_MODES = ["xai_connect", "xai_session", "clone_voice"] as const;
export type FallbackDrillMode = (typeof FALLBACK_DRILL_MODES)[number];
export const DRILL_TTL_MS = 15 * 60_000;
const ARMED_ACTION = "voice.fallback_drill.armed";
const USED_ACTION = "voice.fallback_drill.used";
const EVENT_TYPE = "voice.fallback_drill";

export function isFallbackDrillMode(value: unknown): value is FallbackDrillMode {
  return typeof value === "string" && (FALLBACK_DRILL_MODES as readonly string[]).includes(value);
}

export async function armFallbackDrill(input: {
  userId: string;
  phoneNumber: string;
  mode: FallbackDrillMode;
  actorEmail?: string | null;
  nowMs?: number;
}): Promise<{ expiresAt: string }> {
  const expiresAt = new Date((input.nowMs ?? Date.now()) + DRILL_TTL_MS).toISOString();
  await drizzle
    .insert(auditLog)
    .values({
      userId: input.userId,
      action: ARMED_ACTION,
      eventType: EVENT_TYPE,
      severity: "warning",
      actorEmail: input.actorEmail ?? null,
      resourceType: "phone_number",
      resourceId: input.phoneNumber,
      metadata: { mode: input.mode, expiresAt },
    })
    .execute();
  return { expiresAt };
}

/** The armed drill for this call, consumed once; null on any error. */
export async function consumeFallbackDrill(input: {
  userId: string;
  phoneNumber: string;
}): Promise<FallbackDrillMode | null> {
  try {
    const [armed] = await drizzle
      .select({ id: auditLog.id, metadata: auditLog.metadata })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, input.userId),
          eq(auditLog.action, ARMED_ACTION),
          eq(auditLog.resourceId, input.phoneNumber),
          gt(auditLog.createdAt, sql`now() - (${DRILL_TTL_MS} * interval '1 millisecond')`),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    const mode = (armed?.metadata as { mode?: unknown } | null)?.mode;
    if (!armed || !isFallbackDrillMode(mode)) return null;
    const [used] = await drizzle
      .insert(auditLog)
      .values({
        userId: input.userId,
        action: USED_ACTION,
        eventType: EVENT_TYPE,
        severity: "warning",
        resourceType: "phone_number",
        resourceId: input.phoneNumber,
        idempotencyKey: `fallback-drill:${armed.id}`,
        metadata: { mode },
      })
      .onConflictDoNothing()
      .returning({ id: auditLog.id });
    if (!used) return null;
    log.warn("Fallback drill armed for this call", {
      mode,
      phoneSuffix: input.phoneNumber.slice(-4),
    });
    return mode;
  } catch (error) {
    log.warn("Fallback drill lookup failed; the call proceeds normally", {
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}
