import { distributedLimiterStatus, rateLimit } from "./rate-limit";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

export const PUBLIC_DEMO_MAX_DURATION_SECONDS = 45;

const MINUTE_MS = 60_000;
const TEN_MINUTES_MS = 10 * MINUTE_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export type PublicDemoAdmission =
  | { admitted: true; remainingDaily: number }
  | {
      admitted: false;
      status: 429 | 503;
      reason:
        | "rate_limiter_unavailable"
        | "ticket_replayed"
        | "ip_burst_ceiling"
        | "ip_daily_ceiling"
        | "global_burst_ceiling"
        | "global_daily_ceiling";
      retryAfterSeconds: number;
    };

function unavailable(): PublicDemoAdmission {
  return {
    admitted: false,
    status: 503,
    reason: "rate_limiter_unavailable",
    retryAfterSeconds: 60,
  };
}

export async function admitPublicDemoTicketMint(
  ipFingerprint: string,
): Promise<PublicDemoAdmission> {
  const status = distributedLimiterStatus();
  if (!status.ok) return unavailable();

  try {
    const decision = await rateLimit(ipFingerprint, {
      bucket: "public-demo-ticket-mint",
      windowMs: MINUTE_MS,
      max: 6,
      failClosedOnError: true,
    });
    if (!decision.allowed) {
      return {
        admitted: false,
        status: 429,
        reason: "ip_burst_ceiling",
        retryAfterSeconds: Math.max(1, Math.ceil(decision.resetMs / 1000)),
      };
    }
    return { admitted: true, remainingDaily: decision.remaining };
  } catch (error: unknown) {
    log.error("public demo ticket limiter failed closed", { error: getErrorMessage(error) });
    return unavailable();
  }
}

export async function consumePublicDemoTicket(jti: string): Promise<PublicDemoAdmission> {
  const status = distributedLimiterStatus();
  if (!status.ok) return unavailable();

  try {
    const decision = await rateLimit(jti, {
      bucket: "public-demo-one-use-ticket",
      windowMs: 2 * MINUTE_MS,
      max: 1,
      failClosedOnError: true,
    });
    if (!decision.allowed) {
      return {
        admitted: false,
        status: 429,
        reason: "ticket_replayed",
        retryAfterSeconds: Math.max(1, Math.ceil(decision.resetMs / 1000)),
      };
    }
    return { admitted: true, remainingDaily: decision.remaining };
  } catch (error: unknown) {
    log.error("public demo ticket consumption failed closed", { error: getErrorMessage(error) });
    return unavailable();
  }
}

export async function admitPublicWebDemoSession(
  ipFingerprint: string,
): Promise<PublicDemoAdmission> {
  const status = distributedLimiterStatus();
  if (!status.ok) return unavailable();

  try {
    const ipBurst = await rateLimit(ipFingerprint, {
      bucket: "public-demo-ip-ten-minute",
      windowMs: TEN_MINUTES_MS,
      max: positiveIntegerFromEnv("WIRELINE_PUBLIC_DEMO_IP_TEN_MINUTE_CEILING", 2),
      failClosedOnError: true,
    });
    if (!ipBurst.allowed) {
      return {
        admitted: false,
        status: 429,
        reason: "ip_burst_ceiling",
        retryAfterSeconds: Math.max(1, Math.ceil(ipBurst.resetMs / 1000)),
      };
    }

    const ipDaily = await rateLimit(ipFingerprint, {
      bucket: "public-demo-ip-daily",
      windowMs: DAY_MS,
      max: positiveIntegerFromEnv("WIRELINE_PUBLIC_DEMO_IP_DAILY_SESSION_CEILING", 3),
      failClosedOnError: true,
    });
    if (!ipDaily.allowed) {
      return {
        admitted: false,
        status: 429,
        reason: "ip_daily_ceiling",
        retryAfterSeconds: Math.max(1, Math.ceil(ipDaily.resetMs / 1000)),
      };
    }

    const globalBurst = await rateLimit("all", {
      bucket: "public-demo-global-minute",
      windowMs: MINUTE_MS,
      max: positiveIntegerFromEnv("WIRELINE_PUBLIC_DEMO_GLOBAL_MINUTE_CEILING", 4),
      failClosedOnError: true,
    });
    if (!globalBurst.allowed) {
      return {
        admitted: false,
        status: 429,
        reason: "global_burst_ceiling",
        retryAfterSeconds: Math.max(1, Math.ceil(globalBurst.resetMs / 1000)),
      };
    }

    const globalDaily = await rateLimit("all", {
      bucket: "public-demo-global-daily",
      windowMs: DAY_MS,
      max: positiveIntegerFromEnv("WIRELINE_PUBLIC_DEMO_DAILY_SESSION_CEILING", 40),
      failClosedOnError: true,
    });
    if (!globalDaily.allowed) {
      return {
        admitted: false,
        status: 429,
        reason: "global_daily_ceiling",
        retryAfterSeconds: Math.max(1, Math.ceil(globalDaily.resetMs / 1000)),
      };
    }

    return { admitted: true, remainingDaily: globalDaily.remaining };
  } catch (error: unknown) {
    log.error("public browser demo budget check failed closed", {
      error: getErrorMessage(error),
    });
    return unavailable();
  }
}
