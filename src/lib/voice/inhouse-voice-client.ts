/** Internal speech transport. Tenant consent, ownership and spend admission belong to its caller. */
import { inspectPcm16MonoWav } from "./voice-reference-audio";
import { validateVoiceReference } from "./voice-reference-vault";

export const INHOUSE_VOICE_ENGINE = "chatterbox-nano";
export const INHOUSE_VOICE_SOURCE_REVISION = "5de7a54aa4e5e2baadb0182dde554908b48b85c2";
export const INHOUSE_VOICE_MODEL_REVISION = "71ccd1d0081b430592cea481f4307e764e07bc64";
export const INHOUSE_VOICE_PREVIEW_TEXT =
  "Hello, thanks for calling. How can I help your business today?";

const MAX_AUDIO_BYTES = 2_880_044;
const MAX_JSON_BYTES = 4_096;
// eslint-disable-next-line no-control-regex -- refuse hidden control instructions in speech input.
const INVALID_SPEECH_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
type Operation = "readiness" | "speech";
type ErrorCode =
  "INVALID_INPUT" | "ABORTED" | "UNAVAILABLE" | "BUSY" | "REJECTED" | "INVALID_RESPONSE";

export class InhouseVoiceError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly operation: Operation,
    /** Work may have consumed compute even if its result was lost. Never retry it automatically. */
    readonly workMayHaveStarted: boolean,
    readonly status?: number,
  ) {
    super(
      code === "INVALID_INPUT"
        ? "The voice request is invalid."
        : code === "ABORTED"
          ? "The voice request was interrupted."
          : code === "BUSY"
            ? "The voice engine is busy. Try again shortly."
            : code === "REJECTED"
              ? "The voice engine declined the request."
              : code === "INVALID_RESPONSE"
                ? "The voice engine returned an invalid response."
                : "The voice engine is unavailable.",
    );
    this.name = "InhouseVoiceError";
  }
}

type Options = { signal?: AbortSignal };

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("aborted"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function boundedBytes(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("response too large");
  }
  if (!response.body) throw new Error("missing body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await abortable(reader.read(), signal);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) throw new Error("response too large");
      chunks.push(next.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function createInhouseVoiceClient(input: {
  baseUrl: string;
  serviceToken: string;
  /** Dedicated local development only. Production must use TLS or an explicitly private network. */
  allowInsecurePrivateNetwork?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}) {
  let base: URL;
  try {
    base = new URL(input.baseUrl);
  } catch {
    throw new InhouseVoiceError("INVALID_INPUT", "readiness", false);
  }
  const privateHost =
    base.hostname === "127.0.0.1" ||
    base.hostname === "localhost" ||
    base.hostname === "[::1]" ||
    base.hostname.endsWith(".internal");
  const token = typeof input.serviceToken === "string" ? input.serviceToken.trim() : "";
  const timeoutMs = input.timeoutMs ?? 65_000;
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/" ||
    !(
      base.protocol === "https:" ||
      (base.protocol === "http:" && privateHost && input.allowInsecurePrivateNetwork === true)
    ) ||
    token.length < 32 ||
    token.length > 512 ||
    !/^[!-~]+$/.test(token) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 185_000
  ) {
    throw new InhouseVoiceError("INVALID_INPUT", "readiness", false);
  }
  const fetchImpl = input.fetchImpl ?? fetch;

  async function request<T>(
    operation: Operation,
    path: string,
    init: RequestInit,
    parse: (response: Response, signal: AbortSignal) => Promise<T>,
    options: Options = {},
  ) {
    if (options.signal?.aborted) throw new InhouseVoiceError("ABORTED", operation, false);
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      abort,
      operation === "readiness" ? Math.min(timeoutMs, 5_000) : timeoutMs,
    );
    let started = false;
    try {
      started = true;
      const response = await abortable(
        fetchImpl(new URL(path, base).href, {
          ...init,
          headers: { ...init.headers, Authorization: `Bearer ${token}` },
          redirect: "error",
          signal: controller.signal,
        }),
        controller.signal,
      );
      if (response.redirected || !response.ok) {
        void response.body?.cancel().catch(() => undefined);
        // This worker uses 422 only after inference produced invalid audio.
        const rejected = [400, 401, 403, 404, 413].includes(response.status);
        throw new InhouseVoiceError(
          response.status === 422
            ? "INVALID_RESPONSE"
            : response.status === 429
              ? "BUSY"
              : rejected
                ? "REJECTED"
                : "UNAVAILABLE",
          operation,
          operation === "speech" && !rejected && response.status !== 429,
          response.status,
        );
      }
      try {
        return await parse(response, controller.signal);
      } catch {
        throw new InhouseVoiceError(
          controller.signal.aborted ? "ABORTED" : "INVALID_RESPONSE",
          operation,
          operation === "speech",
          response.status,
        );
      }
    } catch (error) {
      if (error instanceof InhouseVoiceError) throw error;
      throw new InhouseVoiceError(
        controller.signal.aborted ? "ABORTED" : "UNAVAILABLE",
        operation,
        started && operation === "speech",
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }

  async function synthesizeSpeech(
    speech: { text: string; referenceAudio?: Uint8Array },
    options?: Options,
  ) {
    if (!speech || typeof speech.text !== "string")
      throw new InhouseVoiceError("INVALID_INPUT", "speech", false);
    const text = speech.text.trim();
    if (
      !text ||
      Array.from(text).length > 1_000 ||
      Buffer.byteLength(text, "utf8") > 4_000 ||
      INVALID_SPEECH_CONTROLS.test(text)
    ) {
      throw new InhouseVoiceError("INVALID_INPUT", "speech", false);
    }
    if (speech.referenceAudio !== undefined) {
      try {
        validateVoiceReference(speech.referenceAudio);
      } catch {
        throw new InhouseVoiceError("INVALID_INPUT", "speech", false);
      }
    }
    return request(
      "speech",
      "/v1/speech",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "audio/wav" },
        body: JSON.stringify({
          text,
          ...(speech.referenceAudio
            ? { referenceAudioBase64: Buffer.from(speech.referenceAudio).toString("base64") }
            : {}),
        }),
      },
      async (response, signal) => {
        if (
          response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
            "audio/wav" ||
          response.headers.get("x-voice-engine") !== INHOUSE_VOICE_ENGINE ||
          response.headers.get("x-voice-source-revision") !== INHOUSE_VOICE_SOURCE_REVISION ||
          response.headers.get("x-voice-model-revision") !== INHOUSE_VOICE_MODEL_REVISION
        )
          throw new Error("engine mismatch");
        const bytes = await boundedBytes(response, MAX_AUDIO_BYTES, signal);
        const metadata = inspectPcm16MonoWav(bytes, {
          maxBytes: MAX_AUDIO_BYTES,
          minDurationSeconds: 0,
          maxDurationSeconds: 60,
          sampleRates: [24_000],
        });
        return {
          bytes,
          contentType: "audio/wav" as const,
          durationSeconds: metadata.durationSeconds,
          engine: INHOUSE_VOICE_ENGINE,
          modelRevision: INHOUSE_VOICE_MODEL_REVISION,
        };
      },
      options,
    );
  }

  return {
    synthesizeSpeech,
    synthesizePreview(referenceAudio?: Uint8Array, options?: Options) {
      return synthesizeSpeech({ text: INHOUSE_VOICE_PREVIEW_TEXT, referenceAudio }, options);
    },
    async getReadiness(options?: Options) {
      return request(
        "readiness",
        "/readyz",
        { method: "GET" },
        async (response, signal) => {
          const data = JSON.parse(
            Buffer.from(await boundedBytes(response, MAX_JSON_BYTES, signal)).toString("utf8"),
          ) as Record<string, unknown>;
          if (
            !data ||
            data.ready !== true ||
            data.engine !== INHOUSE_VOICE_ENGINE ||
            data.modelRevision !== INHOUSE_VOICE_MODEL_REVISION ||
            data.sourceRevision !== INHOUSE_VOICE_SOURCE_REVISION ||
            data.watermarkReady !== true ||
            data.maxTextCharacters !== 1_000 ||
            data.maxReferenceBytes !== 2_000_000 ||
            data.maxOutputSeconds !== 60 ||
            data.inferenceTimeoutSeconds !== 60 ||
            typeof data.busy !== "boolean" ||
            !["cpu", "cuda", "mps"].includes(String(data.device))
          )
            throw new Error("engine mismatch");
          return {
            ready: true as const,
            busy: data.busy as boolean,
            engine: INHOUSE_VOICE_ENGINE,
            modelRevision: INHOUSE_VOICE_MODEL_REVISION,
            sourceRevision: INHOUSE_VOICE_SOURCE_REVISION,
            device: data.device as "cpu" | "cuda" | "mps",
          };
        },
        options,
      );
    },
  };
}
