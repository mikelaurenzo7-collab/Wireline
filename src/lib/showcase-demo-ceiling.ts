/**
 * Aggregate admission ceiling for BotBound's public showcase phone lines.
 *
 * The OpenAI SIP session has a hard per-call duration cap, but published
 * numbers also need aggregate protection. Admission happens on the signed
 * incoming-call event before founder seeding, runtime construction, spend
 * reservation, or call acceptance.
 */
import { distributedLimiterStatus, rateLimit } from "./rate-limit";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_GLOBAL_DAILY_CALL_CEILING = 60;
const DEFAULT_CALLER_DAILY_CALL_CEILING = 4;

function ceilingFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export type ShowcaseAdmission =
  | { admitted: true }
  | {
      admitted: false;
      reason: "limiter_unavailable" | "global_daily_ceiling" | "caller_daily_ceiling";
    };

export async function admitShowcaseDemoCall(
  callerNumber: string | null,
): Promise<ShowcaseAdmission> {
  const limiter = distributedLimiterStatus();
  if (!limiter.ok) {
    log.error("Public showcase admission denied: distributed limiter unavailable", {
      reason: limiter.reason,
    });
    return { admitted: false, reason: "limiter_unavailable" };
  }

  try {
    const globalDecision = await rateLimit("all", {
      bucket: "showcase:demo-daily",
      windowMs: DAY_MS,
      max: ceilingFromEnv(
        "WIRELINE_SHOWCASE_DAILY_CALL_CEILING",
        DEFAULT_GLOBAL_DAILY_CALL_CEILING,
      ),
      failClosedOnError: true,
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
        failClosedOnError: true,
      });
      if (!callerDecision.allowed) {
        return { admitted: false, reason: "caller_daily_ceiling" };
      }
    }

    return { admitted: true };
  } catch (error: unknown) {
    log.error("Public showcase admission denied: limiter check failed", {
      error: getErrorMessage(error),
    });
    return { admitted: false, reason: "limiter_unavailable" };
  }
}
