import type { NextFunction, Request, Response } from "express";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { dialRateLimiter } from "../middleware/api-rate-limits";
import { enforceTrialOutboundCap } from "./trial-gate";
import { enforce24hSpendCap, enforceSpendCap } from "./spend-guards";
import { quotaRejectionHeaders } from "./tenant-quotas";
import { quotaTracker } from "./server-context";
import { assertVoiceWalletSolvent } from "./voice-wallet-guard";

export class OutboundVoiceControlError extends Error {
  status: number;
  code: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;

  constructor(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
    super(typeof body.error === "string" ? body.error : "Outbound voice is not allowed");
    this.name = "OutboundVoiceControlError";
    this.status = status;
    this.code = typeof body.code === "string" ? body.code : "OUTBOUND_VOICE_BLOCKED";
    this.body = body;
    this.headers = headers;
  }
}

export type OutboundVoiceSource =
  | "manual"
  | "bulk_import"
  | "campaign"
  | "cadence"
  | "callback"
  | "director"
  | "automation";

export interface AssertOutboundVoiceAllowedInput {
  userId: string;
  units?: number;
  source: OutboundVoiceSource;
  ip?: string;
  userAgent?: string;
}

type CapturedResponse = {
  statusCode: number;
  body?: Record<string, unknown>;
  headers: Record<string, string>;
};

function fakeResponse(captured: CapturedResponse): Response {
  return {
    locals: {},
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
      return this;
    },
    setHeader(key: string, value: string) {
      captured.headers[key] = value;
      return this;
    },
    set(key: string, value: string) {
      captured.headers[key] = value;
      return this;
    },
  } as unknown as Response;
}

async function assertMiddlewarePasses(
  middleware: (req: Request, res: Response, next: NextFunction) => unknown,
  input: AssertOutboundVoiceAllowedInput,
): Promise<void> {
  const captured: CapturedResponse = { statusCode: 200, headers: {} };
  const req = {
    user: { id: input.userId },
    ip: input.ip,
    headers: { "user-agent": input.userAgent },
    get(name: string) {
      return (this as { headers: Record<string, string | undefined> }).headers[name.toLowerCase()];
    },
  } as unknown as Request;
  const res = fakeResponse(captured);

  let nextError: unknown;
  let nextCalled = false;
  await Promise.resolve(
    middleware(req, res, (err?: unknown) => {
      nextCalled = true;
      nextError = err;
    }),
  );

  if (nextError) throw nextError;
  if (!nextCalled || captured.body) {
    throw new OutboundVoiceControlError(
      captured.statusCode,
      captured.body ?? { code: "OUTBOUND_VOICE_BLOCKED", error: "Outbound voice is not allowed." },
      captured.headers,
    );
  }
}

export async function assertOutboundVoiceAllowed(
  input: AssertOutboundVoiceAllowedInput,
): Promise<void> {
  try {
    await assertVoiceWalletSolvent(input.userId);
  } catch (err) {
    const walletErr = err as Error & { status?: number; body?: Record<string, unknown> };
    if (walletErr.status && walletErr.body) {
      throw new OutboundVoiceControlError(walletErr.status, walletErr.body);
    }
    throw err;
  }
  await assertMiddlewarePasses(enforceLaunchHardGate, input);
  await assertMiddlewarePasses(enforceTrialOutboundCap, input);
  await assertMiddlewarePasses(enforce24hSpendCap, input);
  await assertMiddlewarePasses(enforceSpendCap, input);
  await assertMiddlewarePasses(dialRateLimiter, input);

  const quotaDecision = await quotaTracker.checkAndIncrement(
    input.userId,
    "voice_minutes_daily",
    Math.max(0, input.units ?? 0),
  );
  if (!quotaDecision.allowed) {
    throw new OutboundVoiceControlError(
      429,
      {
        error: "Daily voice-minute quota exceeded.",
        code: "QUOTA_VOICE",
        quota: quotaDecision,
        source: input.source,
      },
      quotaRejectionHeaders(quotaDecision),
    );
  }
}

export function outboundVoiceGuard(source: OutboundVoiceSource, units = 0) {
  return async function outboundVoiceGuardMw(req: Request, res: Response, next: NextFunction) {
    const userId = (req as Request & { user?: { id?: string } }).user?.id;
    if (!userId)
      return res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
    try {
      await assertOutboundVoiceAllowed({
        userId,
        units,
        source,
        ip: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      });
      next();
    } catch (err) {
      if (err instanceof OutboundVoiceControlError) {
        Object.entries(err.headers).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(err.status).json(err.body);
      }
      next(err);
    }
  };
}
