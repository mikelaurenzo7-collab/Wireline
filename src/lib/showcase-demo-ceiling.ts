/**
 * Aggregate spend ceiling for the public demo lines.
 *
 * Every showcase call already carries a hard per-call COGS cap
 * (maxDurationSeconds: 600 in showcase-assistant.ts), but the published demo
 * numbers had no aggregate budget: bounded per call, unbounded in aggregate.
 * This module adds two rolling 24-hour ceilings enforced at assistant-request
 * time, before any model or voice spend starts:
 *
 * - a global daily call ceiling across all demo lines, and
 * - a per-caller daily ceiling so one number cannot farm the line.
 *
 * Fail posture is deliberately OPEN, unlike the simulation-mint quota: the
 * demo line is the top-of-funnel marketing surface, every admitted call is
 * individually COGS-capped, and silencing the published numbers on a limiter
 * outage costs more than the bounded worst case it would prevent. The
 * simulation quota fails closed because a tracker outage there removes the
 * ONLY ceiling on unbounded vendor sessions.
 */
import { rateLimit } from "./rate-limit";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

const DAY_MS = 24 * 60 * 60 * 1000;

/** ~$77/day worst case at the 600s per-call cap and the blended voice reserve. */
const DEFAULT_GLOBAL_DAILY_CALL_CEILING = 60;
const DEFAULT_CALLER_DAILY_CALL_CEILING = 4;

function ceilingFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export type ShowcaseAdmission =
  { admitted: true } | { admitted: false; reason: "global_daily_ceiling" | "caller_daily_ceiling" };

export async function admitShowcaseDemoCall(
  callerNumber: string | null,
): Promise<ShowcaseAdmission> {
  try {
    const globalDecision = await rateLimit("all", {
      bucket: "showcase:demo-daily",
      windowMs: DAY_MS,
      max: ceilingFromEnv(
        "WIRELINE_SHOWCASE_DAILY_CALL_CEILING",
        DEFAULT_GLOBAL_DAILY_CALL_CEILING,
      ),
    });
    if (!globalDecision.allowed) {
      return { admitted: false, reason: "global_daily_ceiling" };
    }

    if (callerNumber) {
      const callerDecision = await rateLimit(callerNumber, {
        bucket: "showcase:demo-caller-daily",
        windowMs: DAY_MS,
        max: ceilingFromEnv(
          "WIRELINE_SHOWCASE_CALLER_DAILY_CALL_CEILING",
          DEFAULT_CALLER_DAILY_CALL_CEILING,
        ),
      });
      if (!callerDecision.allowed) {
        return { admitted: false, reason: "caller_daily_ceiling" };
      }
    }

    return { admitted: true };
  } catch (error: unknown) {
    log.error("showcase demo ceiling check failed, admitting call", {
      error: getErrorMessage(error),
    });
    return { admitted: true };
  }
}
