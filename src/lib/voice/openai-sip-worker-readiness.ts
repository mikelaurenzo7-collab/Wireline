import { createHmac, timingSafeEqual } from "node:crypto";
import { openAISipConfigured, resolveOpenAISipSessionMaxSeconds } from "./openai-sip-config";
import { voiceWorkerOrigin, voiceWorkerServiceSecret } from "./openai-sip-worker-config";
import { VOICE_WORKER_AUTH_HEADER } from "./openai-sip-worker-dispatch";

export const VOICE_WORKER_READINESS_PROTOCOL = 1;
export const VOICE_WORKER_READINESS_TIMEOUT_MS = 8_000;

export type VoiceWorkerReadiness = {
  ready: true;
  protocol: number;
  source_revision: string;
  max_call_seconds: number;
  sip_configuration_fingerprint: string;
};

export function voiceWorkerSourceRevision(env: NodeJS.ProcessEnv = process.env): string {
  const revision = env.WIRELINE_VOICE_WORKER_SOURCE_REVISION?.trim() || "";
  if (!/^[a-f0-9]{40}$/i.test(revision)) {
    throw new Error(
      "WIRELINE_VOICE_WORKER_SOURCE_REVISION must be the deployed 40-character git revision.",
    );
  }
  return revision.toLowerCase();
}

/** Compare routing/signature settings without disclosing their values. */
export function voiceWorkerSipFingerprint(env: NodeJS.ProcessEnv = process.env): string {
  const values = [env.OPENAI_PROJECT_ID, env.OPENAI_WEBHOOK_SECRET, env.INTERNAL_JWT_SECRET].map(
    (value) => value?.trim() || "",
  );
  if (values.some((value) => !value)) throw new Error("Worker SIP parity settings are incomplete.");
  return createHmac("sha256", voiceWorkerServiceSecret(env))
    .update(JSON.stringify({ protocol: VOICE_WORKER_READINESS_PROTOCOL, values }))
    .digest("hex");
}

export async function readVoiceWorkerReadiness(
  checkDatabase: () => Promise<unknown>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<VoiceWorkerReadiness> {
  if (env.WIRELINE_VOICE_WORKER !== "true" || env.VERCEL === "1" || !openAISipConfigured(env)) {
    throw new Error("Persistent worker runtime is not configured.");
  }
  const source_revision = voiceWorkerSourceRevision(env);
  const sip_configuration_fingerprint = voiceWorkerSipFingerprint(env);
  await checkDatabase();
  return {
    ready: true,
    protocol: VOICE_WORKER_READINESS_PROTOCOL,
    source_revision,
    max_call_seconds: resolveOpenAISipSessionMaxSeconds(env),
    sip_configuration_fingerprint,
  };
}

export type VoiceWorkerReadinessProbe = {
  ready: boolean;
  detail: string;
  expected_source_revision?: string;
  worker_source_revision?: string;
  max_call_seconds?: number;
};

export async function probeVoiceWorkerReadiness(
  expectedRevision: string,
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): Promise<VoiceWorkerReadinessProbe> {
  const expected = expectedRevision.trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected)) {
    return { ready: false, detail: "Expected worker source revision is missing or invalid." };
  }
  try {
    const endpoint = new URL("/readyz", voiceWorkerOrigin(env));
    const response = await request(endpoint, {
      method: "GET",
      redirect: "error",
      headers: { [VOICE_WORKER_AUTH_HEADER]: voiceWorkerServiceSecret(env) },
      signal: AbortSignal.timeout(VOICE_WORKER_READINESS_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ready: false,
        detail: "Worker readiness was unavailable or service authentication was rejected.",
      };
    }
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") {
      return { ready: false, detail: "Worker readiness response was invalid." };
    }
    const body = value as Record<string, unknown>;
    if (body.ready !== true || body.protocol !== VOICE_WORKER_READINESS_PROTOCOL) {
      return {
        ready: false,
        detail: "Worker is draining, unready, or uses an incompatible readiness protocol.",
      };
    }
    if (body.source_revision !== expected) {
      return {
        ready: false,
        detail: "Worker source revision does not match the release being verified.",
        expected_source_revision: expected,
        ...(typeof body.source_revision === "string" && /^[a-f0-9]{40}$/.test(body.source_revision)
          ? { worker_source_revision: body.source_revision }
          : {}),
      };
    }
    if (body.max_call_seconds !== resolveOpenAISipSessionMaxSeconds(env)) {
      return { ready: false, detail: "Web and worker maximum call durations differ." };
    }
    const expectedFingerprint = voiceWorkerSipFingerprint(env);
    const actualFingerprint = body.sip_configuration_fingerprint;
    if (
      typeof actualFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(actualFingerprint) ||
      !timingSafeEqual(Buffer.from(actualFingerprint), Buffer.from(expectedFingerprint))
    ) {
      return { ready: false, detail: "Web and worker SIP project or signing settings differ." };
    }
    return {
      ready: true,
      detail:
        "Authenticated worker, database access, source revision, duration and SIP signing parity verified.",
      expected_source_revision: expected,
      worker_source_revision: expected,
      max_call_seconds: body.max_call_seconds as number,
    };
  } catch {
    // Do not echo transport/configuration errors: they may contain credentials.
    return {
      ready: false,
      detail:
        "Worker readiness could not be verified. Check its HTTPS origin, service secret and connectivity.",
    };
  }
}
