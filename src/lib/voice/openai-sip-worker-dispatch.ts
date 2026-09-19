import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

import { AppError } from "../api-error";
import { OPENAI_SIP_WEBHOOK_PATH } from "./openai-sip-config";
import { voiceWorkerServiceSecret, voiceWorkerOrigin } from "./openai-sip-worker-config";

export const VOICE_WORKER_AUTH_HEADER = "x-botbound-voice-worker-key";
export const VOICE_WORKER_DISPATCH_TIMEOUT_MS = 30_000;
const UNAVAILABLE = "Phone call control is temporarily unavailable. Please try again shortly.";

export function verifyVoiceWorkerServiceAuth(
  supplied: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    const expected = Buffer.from(voiceWorkerServiceSecret(env));
    const candidate = Buffer.from(supplied);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function voiceWorkerEndpoint(env: NodeJS.ProcessEnv = process.env): string {
  return new URL(OPENAI_SIP_WEBHOOK_PATH, voiceWorkerOrigin(env)).toString();
}

/** Forward only after OpenAI signature verification, before tenant/provider work. */
export async function forwardOpenAISipWebhook(
  req: Request,
  res: Response,
  raw: Buffer,
): Promise<boolean> {
  const worker = process.env.WIRELINE_VOICE_WORKER === "true";
  if (worker) {
    // An accidental worker flag on Vercel must not create a forwarding loop or
    // strand an accepted call in a short-lived function.
    if (process.env.VERCEL === "1") throw AppError.serviceUnavailable(UNAVAILABLE);
    if (!verifyVoiceWorkerServiceAuth(String(req.get(VOICE_WORKER_AUTH_HEADER) || ""))) {
      throw AppError.unauthorized("Invalid voice worker authentication.");
    }
    return false;
  }
  // Direct local development remains usable; every deployed production SIP
  // call requires a separately supervised persistent worker.
  if (
    !process.env.WIRELINE_VOICE_WORKER_URL &&
    process.env.VERCEL !== "1" &&
    process.env.NODE_ENV !== "production"
  ) {
    return false;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VOICE_WORKER_DISPATCH_TIMEOUT_MS);
  try {
    const response = await fetch(voiceWorkerEndpoint(), {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        [VOICE_WORKER_AUTH_HEADER]: voiceWorkerServiceSecret(),
        "webhook-id": String(req.get("webhook-id") || ""),
        "webhook-timestamp": String(req.get("webhook-timestamp") || ""),
        "webhook-signature": String(req.get("webhook-signature") || ""),
      },
      body: new Uint8Array(raw),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Voice worker did not acknowledge the call.");
    const outcome = (await response.json()) as {
      received?: unknown;
      handled?: unknown;
      duplicate?: unknown;
    };
    if (outcome.received !== true || typeof outcome.handled !== "boolean") {
      throw new Error("Voice worker acknowledgement was invalid.");
    }
    res.status(202).json({
      received: true,
      handled: outcome.handled,
      ...(outcome.duplicate === true ? { duplicate: true } : {}),
    });
    return true;
  } catch {
    // The worker may already have accepted a call. Return a retryable response;
    // its existing durable claim suppresses duplicate spend/session startup.
    throw AppError.serviceUnavailable(UNAVAILABLE);
  } finally {
    clearTimeout(timeout);
  }
}
