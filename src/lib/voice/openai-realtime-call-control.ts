import { AppError } from "../api-error";
import {
  assertLiveExternalActionAllowed,
  assertPrivateVoiceSimulationAllowed,
} from "../account-environment-policy";
import { enqueue } from "../job-queue";
import { openAISafetyIdentifierForIdentity } from "../provider-identity-context";
import { markRealtimeProviderCallOutcome } from "../realtime-provider-outcome";
import { drizzle, fetchWithTimeout, log } from "../server-context";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import {
  OpenAIRealtimeProviderError,
  openAIRealtimeCallMayExistAfterResponse,
  openAIRealtimeFailureFromError,
  openAIRealtimeFailureLogFields,
  openAIRealtimeProviderFailure,
} from "./openai-realtime-provider-failure";
import {
  openAIRealtimeSourceForPurpose,
  selectCurrentOpenAIRealtimeKey,
  selectOpenAIRealtimeHangupKey,
  type OpenAIRealtimeKeyPurpose,
  type OpenAIRealtimeKeySource,
} from "./openai-realtime-keyring";

export type { OpenAIRealtimeKeyPurpose, OpenAIRealtimeKeySource } from "./openai-realtime-keyring";

const OPENAI_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const OPENAI_REALTIME_SECRET_TTL_SECONDS = 120;

export const OPENAI_REALTIME_SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

type RealtimeCallAdmission = "live_external" | "private_simulation";

type ServerManagedRealtimeCallInput = {
  userId: string;
  safetyIdentity?: string;
  sdp: string;
  session: Record<string, unknown>;
  keyPurpose?: OpenAIRealtimeKeyPurpose;
  maxDurationSeconds: number;
  logContext?: Record<string, unknown>;
  /**
   * Private simulation admits classified test/demo/production workspaces for
   * browser Preview Voice. The default remains a live external action so PSTN
   * and other provider-backed Realtime mints stay production-only.
   */
  admission?: RealtimeCallAdmission;
};

function resolveApiKey(
  purpose: OpenAIRealtimeKeyPurpose,
  requiredSource?: OpenAIRealtimeKeySource,
): { value: string; source: OpenAIRealtimeKeySource; fingerprint: string } {
  const source = openAIRealtimeSourceForPurpose(process.env, purpose, requiredSource);
  const key = selectCurrentOpenAIRealtimeKey(process.env, purpose, requiredSource);
  if (!source || !key) {
    throw AppError.fromHttpStatus(
      503,
      source === "chatgpt_demo"
        ? "The authenticated live rehearsal is temporarily unavailable."
        : "OpenAI Realtime is not configured.",
    );
  }
  return key;
}

function validCallId(callId: string): boolean {
  return /^[A-Za-z0-9_.:-]{1,256}$/.test(callId);
}

function validateSdp(raw: string): string {
  const sdp = raw.trim();
  if (sdp.length < 100 || sdp.length > 60_000 || !sdp.startsWith("v=")) {
    throw AppError.fromHttpStatus(400, "A valid WebRTC offer is required.");
  }
  // RFC 8866 requires every SDP line, including the last, to end in CRLF.
  // Trimming the browser offer without restoring that terminator makes valid
  // offers fail against strict WebRTC parsers.
  return `${sdp}\r\n`;
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
  const key = input.expectedKeyFingerprint
    ? selectOpenAIRealtimeHangupKey(process.env, {
        purpose,
        requiredSource: input.keySource,
        expectedFingerprint: input.expectedKeyFingerprint,
      })
    : resolveApiKey(purpose, input.keySource);
  if (!key) {
    log.error("OpenAI Realtime hangup credential changed before deadline", {
      callId,
      purpose,
      expectedKeyFingerprint: input.expectedKeyFingerprint,
      keySource:
        input.keySource || openAIRealtimeSourceForPurpose(process.env, purpose) || "unavailable",
      providerCallMayExist: true,
    });
    throw new Error("OpenAI Realtime hangup credential is unavailable for the creating key.");
  }
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${OPENAI_REALTIME_CALLS_URL}/${encodeURIComponent(callId)}/hangup`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key.value}` },
      },
      15_000,
    );
  } catch (error) {
    throw new OpenAIRealtimeProviderError(
      "OpenAI Realtime hangup",
      openAIRealtimeFailureFromError(error, "hangup_transport_failed"),
    );
  }
  // A provider retry after the peer already closed is an idempotent success.
  if (response.ok || response.status === 404 || response.status === 409) return;
  throw new OpenAIRealtimeProviderError(
    "OpenAI Realtime hangup",
    openAIRealtimeProviderFailure(response, "hangup_failed"),
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
const TENANT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createServerManagedOpenAIRealtimeCall(input: ServerManagedRealtimeCallInput) {
  const isTenantCall =
    input.userId !== OPENAI_REALTIME_SYSTEM_USER_ID && TENANT_UUID_RE.test(input.userId);
  if (!isTenantCall) return createServerManagedOpenAIRealtimeCallUnfenced(input);

  if (input.admission === "private_simulation") {
    await assertPrivateVoiceSimulationAllowed(
      input.userId,
      "openai_realtime_private_voice_simulation",
    );
  } else {
    await assertLiveExternalActionAllowed(input.userId, "openai_realtime_call_create");
  }
  const outcome = await runTenantProviderWorkWithDeletionFence({
    userId: input.userId,
    operation: "openai_realtime_call_create",
    ttlMs: 65 * 60_000,
    retainOnSuccess: true,
    perform: () => createServerManagedOpenAIRealtimeCallUnfenced(input),
  });
  if (!outcome.performed) {
    throw AppError.conflict(
      "This workspace has reached its account-deletion deadline. A new live call cannot start.",
    );
  }
  return outcome.result;
}

async function createServerManagedOpenAIRealtimeCallUnfenced(
  input: ServerManagedRealtimeCallInput,
) {
  const purpose = input.keyPurpose || "runtime";
  const key = resolveApiKey(purpose);
  const sdp = validateSdp(input.sdp);
  const duration = Math.max(15, Math.min(3_600, Math.floor(input.maxDurationSeconds)));
  const safetyId = openAISafetyIdentifierForIdentity(input.safetyIdentity || input.userId);

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
    if (!secretResponse.ok) {
      const failure = openAIRealtimeProviderFailure(secretResponse, "client_secret_mint_failed");
      log.warn("OpenAI Realtime client secret mint failed", {
        ...input.logContext,
        purpose,
        ...openAIRealtimeFailureLogFields(failure),
      });
      throw markRealtimeProviderCallOutcome(
        AppError.fromHttpStatus(502, "Live voice session could not be created."),
        false,
      );
    }

    const secretText = await secretResponse.text();
    let secretPayload: { value?: string } = {};
    if (secretText) {
      try {
        secretPayload = JSON.parse(secretText) as { value?: string };
      } catch {
        secretPayload = {};
      }
    }
    const ephemeralKey = typeof secretPayload.value === "string" ? secretPayload.value.trim() : "";
    if (!ephemeralKey) {
      const failure = openAIRealtimeProviderFailure(secretResponse, "client_secret_missing");
      log.warn("OpenAI Realtime client secret mint failed", {
        ...input.logContext,
        purpose,
        ...openAIRealtimeFailureLogFields(failure),
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
    if (!response.ok) {
      const failure = openAIRealtimeProviderFailure(response, "webrtc_call_create_failed");
      log.warn("OpenAI Realtime WebRTC call creation failed", {
        ...input.logContext,
        purpose,
        ...openAIRealtimeFailureLogFields(failure),
      });
      throw markRealtimeProviderCallOutcome(
        AppError.fromHttpStatus(502, "Live voice session could not be created."),
        openAIRealtimeCallMayExistAfterResponse(response),
      );
    }

    const location = response.headers.get("location") || "";
    const callId = location.split("/").filter(Boolean).pop()?.trim() || "";
    if (!validCallId(callId)) {
      const failure = openAIRealtimeProviderFailure(response, "controllable_call_id_missing");
      log.error("OpenAI Realtime call response omitted a controllable call id", {
        ...input.logContext,
        purpose,
        ...openAIRealtimeFailureLogFields(failure),
      });
      throw markRealtimeProviderCallOutcome(
        AppError.fromHttpStatus(502, "Live voice session could not be controlled safely."),
        true,
      );
    }

    let answer: string;
    try {
      // The provider already created a call. Reading or validating its answer
      // can still fail, so both belong inside the emergency-hangup boundary.
      answer = await response.text();
      if (!answer.startsWith("v=")) {
        const failure = openAIRealtimeProviderFailure(response, "webrtc_answer_invalid");
        log.warn("OpenAI Realtime WebRTC call creation failed", {
          ...input.logContext,
          purpose,
          ...openAIRealtimeFailureLogFields(failure),
        });
        throw AppError.fromHttpStatus(502, "Live voice session could not be created.");
      }
      await scheduleAuthoritativeHangup({
        userId: input.userId,
        callId,
        keyPurpose: purpose,
        keySource: key.source,
        keyFingerprint: key.fingerprint,
        maxDurationSeconds: duration,
      });
    } catch (error) {
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
          ...openAIRealtimeFailureLogFields(
            openAIRealtimeFailureFromError(hangupError, "emergency_hangup_failed"),
          ),
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
      throw markRealtimeProviderCallOutcome(
        error instanceof AppError
          ? error
          : AppError.fromHttpStatus(503, "Live voice safety controls are temporarily unavailable."),
        false,
      );
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
      ...openAIRealtimeFailureLogFields(
        openAIRealtimeFailureFromError(error, "signaling_transport_failed"),
      ),
    });
    throw markRealtimeProviderCallOutcome(
      AppError.fromHttpStatus(502, "Live voice session request failed."),
      providerCallRequested,
    );
  }
}
