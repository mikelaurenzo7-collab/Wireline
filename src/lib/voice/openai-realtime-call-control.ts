import { createHash } from "node:crypto";

import { AppError } from "../api-error";
import { enqueue } from "../job-queue";
import { markRealtimeProviderCallOutcome } from "../realtime-provider-outcome";
import { drizzle, fetchWithTimeout, log } from "../server-context";
import { getErrorMessage } from "../server-utils";

const OPENAI_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const OPENAI_REALTIME_SECRET_TTL_SECONDS = 120;

export const OPENAI_REALTIME_SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
export type OpenAIRealtimeKeyPurpose = "runtime" | "chatgpt_demo";
export type OpenAIRealtimeKeySource = "runtime" | "chatgpt_demo";

type ServerManagedRealtimeCallInput = {
  userId: string;
  safetyIdentity?: string;
  sdp: string;
  session: Record<string, unknown>;
  keyPurpose?: OpenAIRealtimeKeyPurpose;
  maxDurationSeconds: number;
  logContext?: Record<string, unknown>;
};

function keyFingerprint(apiKey: string): string {
  return createHash("sha256")
    .update("botbound:openai-realtime-key:v1:")
    .update(apiKey)
    .digest("hex")
    .slice(0, 24);
}

function resolveApiKey(
  purpose: OpenAIRealtimeKeyPurpose,
  requiredSource?: OpenAIRealtimeKeySource,
): { value: string; source: OpenAIRealtimeKeySource; fingerprint: string } {
  const source =
    requiredSource ||
    (purpose === "chatgpt_demo" && process.env.OPENAI_API_KEY_CHATKIT?.trim()
      ? "chatgpt_demo"
      : "runtime");
  const apiKey =
    source === "chatgpt_demo"
      ? process.env.OPENAI_API_KEY_CHATKIT?.trim()
      : process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw AppError.fromHttpStatus(
      503,
      source === "chatgpt_demo"
        ? "The protected live demo is temporarily unavailable."
        : "OpenAI Realtime is not configured.",
    );
  }
  return { value: apiKey, source, fingerprint: keyFingerprint(apiKey) };
}

function safetyIdentifier(seed: string): string {
  return createHash("sha256").update(`botbound:${seed}`).digest("hex");
}

function validCallId(callId: string): boolean {
  return /^[A-Za-z0-9_.:-]{1,256}$/.test(callId);
}

function validateSdp(raw: string): string {
  const sdp = raw.trim();
  if (sdp.length < 100 || sdp.length > 60_000 || !sdp.startsWith("v=")) {
    throw AppError.fromHttpStatus(400, "A valid WebRTC offer is required.");
  }
  return sdp;
}

export async function hangupOpenAIRealtimeCall(input: {
  callId: string;
  keyPurpose?: OpenAIRealtimeKeyPurpose;
  keySource?: OpenAIRealtimeKeySource;
  expectedKeyFingerprint?: string;
}): Promise<void> {
  const callId = input.callId.trim();
  if (!validCallId(callId)) throw new Error("OpenAI Realtime hangup job has an invalid call id.");
  const purpose = input.keyPurpose || "runtime";
  const key = resolveApiKey(purpose, input.keySource);
  if (input.expectedKeyFingerprint && input.expectedKeyFingerprint !== key.fingerprint) {
    log.error("OpenAI Realtime hangup credential changed before deadline", {
      callId,
      purpose,
      expectedKeyFingerprint: input.expectedKeyFingerprint,
      currentKeyFingerprint: key.fingerprint,
      keySource: key.source,
      providerCallMayExist: true,
    });
    throw new Error("OpenAI Realtime hangup credential no longer matches the creating key.");
  }
  const response = await fetchWithTimeout(
    `${OPENAI_REALTIME_CALLS_URL}/${encodeURIComponent(callId)}/hangup`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key.value}` },
    },
    15_000,
  );
  const body = await response.text();
  // A provider retry after the peer already closed is an idempotent success.
  if (response.ok || response.status === 404 || response.status === 409) return;
  throw new Error(
    `OpenAI Realtime hangup failed (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`,
  );
}

async function scheduleAuthoritativeHangup(input: {
  userId: string;
  callId: string;
  keyPurpose: OpenAIRealtimeKeyPurpose;
  keySource: OpenAIRealtimeKeySource;
  keyFingerprint: string;
  maxDurationSeconds: number;
}) {
  const result = await enqueue(drizzle, {
    userId: input.userId,
    type: "openai_realtime_hangup",
    payload: {
      callId: input.callId,
      keyPurpose: input.keyPurpose,
      keySource: input.keySource,
      keyFingerprint: input.keyFingerprint,
      maxDurationSeconds: input.maxDurationSeconds,
    },
    runAt: new Date(Date.now() + input.maxDurationSeconds * 1_000),
    maxAttempts: 3,
  });
  if (!result.ok) throw new Error(result.error || "OpenAI Realtime hangup was not scheduled.");
}

/**
 * Create a WebRTC call without exposing a reusable provider credential to the
 * browser. A durable hangup is committed before the SDP answer is returned, so
 * provider billing cannot silently continue to the 60-minute platform maximum
 * when a tab disappears or a client ignores its local timer.
 */
export async function createServerManagedOpenAIRealtimeCall(input: ServerManagedRealtimeCallInput) {
  const purpose = input.keyPurpose || "runtime";
  const key = resolveApiKey(purpose);
  const sdp = validateSdp(input.sdp);
  const duration = Math.max(15, Math.min(3_600, Math.floor(input.maxDurationSeconds)));
  const safetyId = safetyIdentifier(input.safetyIdentity || input.userId);

  let providerCallRequested = false;
  try {
    const secretResponse = await fetchWithTimeout(
      OPENAI_REALTIME_CLIENT_SECRETS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key.value}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyId,
        },
        body: JSON.stringify({
          session: input.session,
          expires_after: {
            anchor: "created_at",
            seconds: OPENAI_REALTIME_SECRET_TTL_SECONDS,
          },
        }),
      },
      15_000,
    );
    const secretText = await secretResponse.text();
    let secretPayload: { value?: string } = {};
    if (secretText) {
      try {
        secretPayload = JSON.parse(secretText) as { value?: string };
      } catch {
        secretPayload = {};
      }
    }
    const ephemeralKey = secretPayload.value?.trim() || "";
    if (!secretResponse.ok || !ephemeralKey) {
      log.warn("OpenAI Realtime client secret mint failed", {
        ...input.logContext,
        purpose,
        status: secretResponse.status,
        body: secretText.slice(0, 500),
      });
      throw markRealtimeProviderCallOutcome(
        AppError.fromHttpStatus(502, "Live voice session could not be created."),
        false,
      );
    }

    providerCallRequested = true;
    const response = await fetchWithTimeout(
      OPENAI_REALTIME_CALLS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
          "OpenAI-Safety-Identifier": safetyId,
        },
        body: sdp,
      },
      20_000,
    );
    const answer = await response.text();
    if (!response.ok || !answer.startsWith("v=")) {
      log.warn("OpenAI Realtime WebRTC call creation failed", {
        ...input.logContext,
        purpose,
        status: response.status,
        body: answer.slice(0, 500),
      });
      throw markRealtimeProviderCallOutcome(
        AppError.fromHttpStatus(502, "Live voice session could not be created."),
        response.ok,
      );
    }

    const location = response.headers.get("location") || "";
    const callId = location.split("/").filter(Boolean).pop()?.trim() || "";
    if (!validCallId(callId)) {
      log.error("OpenAI Realtime call response omitted a controllable call id", {
        ...input.logContext,
        purpose,
      });
      throw markRealtimeProviderCallOutcome(
        AppError.fromHttpStatus(502, "Live voice session could not be controlled safely."),
        true,
      );
    }

    try {
      await scheduleAuthoritativeHangup({
        userId: input.userId,
        callId,
        keyPurpose: purpose,
        keySource: key.source,
        keyFingerprint: key.fingerprint,
        maxDurationSeconds: duration,
      });
    } catch {
      // Never hand an unbounded provider session to the browser. Best-effort
      // immediate hangup also limits spend if the durable queue is unavailable.
      try {
        await hangupOpenAIRealtimeCall({
          callId,
          keyPurpose: purpose,
          keySource: key.source,
          expectedKeyFingerprint: key.fingerprint,
        });
      } catch (hangupError) {
        log.error("OpenAI Realtime emergency hangup failed", {
          ...input.logContext,
          callId,
          error: getErrorMessage(hangupError),
          providerCallMayExist: true,
        });
        // 502 is the caller contract for an ambiguous provider outcome. Both
        // web and MCP accounting paths retain their quota/cost reservations on
        // 502, so a possibly-live call cannot become invisible spend.
        throw markRealtimeProviderCallOutcome(
          AppError.fromHttpStatus(502, "Live voice session safety status is unknown."),
          true,
        );
      }
      throw AppError.fromHttpStatus(503, "Live voice safety controls are temporarily unavailable.");
    }

    return {
      sdp: answer,
      callId,
      maxDurationSeconds: duration,
      keySource: key.source,
      keyFingerprint: key.fingerprint,
    } as const;
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error("OpenAI Realtime server-managed signaling failed", {
      ...input.logContext,
      purpose,
      error: getErrorMessage(error),
    });
    throw markRealtimeProviderCallOutcome(
      AppError.fromHttpStatus(502, "Live voice session request failed."),
      providerCallRequested,
    );
  }
}
