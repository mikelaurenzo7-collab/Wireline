/**
 * Server-only ElevenLabs transport foundation. This is not a live-call runtime.
 * Callers must enforce tenant ownership, consent, budget reservations, durable
 * asset receipts and deletion fencing before using these methods. A vendor
 * account listing is never evidence that a BotBound tenant owns a voice.
 *
 * Contracts: https://elevenlabs.io/docs/api-reference/voices/ivc/create
 * https://elevenlabs.io/docs/api-reference/voices/search
 * https://elevenlabs.io/docs/api-reference/voices/get
 * https://elevenlabs.io/docs/api-reference/voices/delete
 * https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 * https://elevenlabs.io/docs/api-reference/user/get
 * https://elevenlabs.io/docs/api-reference/user/subscription/get
 */
import { Buffer } from "node:buffer";

const ORIGIN = "https://api.elevenlabs.io";
const MAX_JSON_BYTES = 256 * 1_024;
const MAX_PREVIEW_BYTES = 2 * 1_024 * 1_024;
const MAX_SAMPLE_BYTES = 10 * 1_024 * 1_024;
const MAX_TOTAL_SAMPLE_BYTES = 15 * 1_024 * 1_024;
const SAMPLE_EXTENSIONS: Readonly<Record<string, string>> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

export const ELEVENLABS_VOICE_PREVIEW = {
  text: "Hello, thanks for calling. How can I help your business today?",
  modelId: "eleven_flash_v2_5",
  outputFormat: "mp3_44100_128",
} as const;

type Operation = "create" | "get" | "list" | "delete" | "preview" | "account" | "subscription";
type ErrorCode =
  "INVALID_INPUT" | "ABORTED" | "PROVIDER_REJECTED" | "PROVIDER_UNAVAILABLE" | "INVALID_RESPONSE";

/** Unknown outcomes must retain the caller's pending receipt; never retry a mutation blindly. */
export class ElevenLabsVoiceError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly operation: Operation,
    readonly providerMayHaveAccepted: boolean,
    readonly providerStatus?: number,
  ) {
    super(
      code === "INVALID_INPUT"
        ? "The voice request is invalid."
        : code === "ABORTED"
          ? "The voice request was interrupted."
          : code === "PROVIDER_REJECTED"
            ? "The voice provider declined the request."
            : code === "INVALID_RESPONSE"
              ? "The voice provider returned an invalid response."
              : "The voice provider is temporarily unavailable.",
    );
    this.name = "ElevenLabsVoiceError";
  }
}

export type ElevenLabsVoiceSummary = {
  voiceId: string;
  name: string | null;
  category: string | null;
  requiresVerification: boolean | null;
  verified: boolean | null;
};

// Published API enum, also generated in the official elevenlabs-js SDK's
// SubscriptionStatusType. Unknown future states must not imply eligibility.
const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "incomplete",
  "past_due",
  "free",
  "free_disabled",
] as const;
export type ElevenLabsSubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * A provider capability snapshot, not admission, funding or OEM authorization.
 * Character counters are provider units and must never be treated as USD.
 * Null optional limits remain unknown; they must not be treated as unlimited.
 */
export type ElevenLabsSubscriptionCapabilities = {
  tier: string;
  status: ElevenLabsSubscriptionStatus;
  canUseInstantVoiceCloning: boolean;
  canUseProfessionalVoiceCloning: boolean;
  characterCount: number;
  characterLimit: number;
  nextCharacterCountResetUnix: number | null;
  voiceSlotsUsed: number;
  voiceLimit: number;
  voiceAddEditCounter: number;
  maxVoiceAddEdits: number | null;
  /** With consolidated billing this can include other workspaces. */
  professionalVoiceSlotsUsed: number;
  professionalVoiceSlotsUsedInWorkspace: number;
  professionalVoiceLimit: number;
  canExtendCharacterLimit: boolean;
  maxCreditLimitExtension: number | "unlimited";
  canExtendVoiceLimit: boolean;
};

export type ElevenLabsAccountCapabilities = {
  /** The documented workspace to which this API key belongs, never a BotBound tenant ID. */
  workspaceId: string;
  subscription: ElevenLabsSubscriptionCapabilities;
};

type RequestOptions = { signal?: AbortSignal };
type CloneInput = {
  name: string;
  description?: string;
  /** Source decoding, duration, single-speaker and consent checks belong to the caller. */
  samples: ReadonlyArray<{ bytes: Uint8Array; mimeType: string }>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // eslint-disable-next-line no-control-regex
  return trimmed && trimmed.length <= max && !/[\u0000-\u001f\u007f]/.test(trimmed)
    ? trimmed
    : null;
}

function voiceId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}

function counter(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("invalid capability counter");
  return value;
}

function capability(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("invalid capability flag");
  return value;
}

function subscriptionCapabilities(value: unknown): ElevenLabsSubscriptionCapabilities {
  const row = record(value);
  if (
    !row ||
    typeof row.tier !== "string" ||
    !/^[a-z][a-z0-9_-]{0,79}$/.test(row.tier) ||
    !SUBSCRIPTION_STATUSES.includes(row.status as ElevenLabsSubscriptionStatus)
  )
    throw new Error("invalid subscription");
  const reset =
    row.next_character_count_reset_unix == null
      ? null
      : counter(row.next_character_count_reset_unix);
  // Bound Unix seconds to the range that remains representable as a JS Date.
  if (reset !== null && reset > 8_640_000_000_000) throw new Error("invalid reset time");
  return {
    tier: row.tier,
    status: row.status as ElevenLabsSubscriptionStatus,
    canUseInstantVoiceCloning: capability(row.can_use_instant_voice_cloning),
    canUseProfessionalVoiceCloning: capability(row.can_use_professional_voice_cloning),
    characterCount: counter(row.character_count),
    characterLimit: counter(row.character_limit),
    nextCharacterCountResetUnix: reset,
    voiceSlotsUsed: counter(row.voice_slots_used),
    voiceLimit: counter(row.voice_limit),
    voiceAddEditCounter: counter(row.voice_add_edit_counter),
    maxVoiceAddEdits: row.max_voice_add_edits == null ? null : counter(row.max_voice_add_edits),
    professionalVoiceSlotsUsed: counter(row.professional_voice_slots_used),
    professionalVoiceSlotsUsedInWorkspace: counter(row.professional_voice_slots_used_in_workspace),
    professionalVoiceLimit: counter(row.professional_voice_limit),
    canExtendCharacterLimit: capability(row.can_extend_character_limit),
    maxCreditLimitExtension:
      row.max_credit_limit_extension === "unlimited"
        ? "unlimited"
        : counter(row.max_credit_limit_extension),
    canExtendVoiceLimit: capability(row.can_extend_voice_limit),
  };
}

function summarize(value: unknown): ElevenLabsVoiceSummary | null {
  const row = record(value);
  const id = voiceId(row?.voice_id);
  const name = text(row?.name, 200);
  // The provider permits unnamed voices. Preserve the valid identity and let
  // the caller supply a display fallback without inventing a provider name.
  if (!id) return null;
  const verification = record(row?.voice_verification);
  return {
    voiceId: id,
    name,
    category: text(row?.category, 80),
    requiresVerification:
      typeof verification?.requires_verification === "boolean"
        ? verification.requires_verification
        : null,
    verified: typeof verification?.is_verified === "boolean" ? verification.is_verified : null,
  };
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new Error("aborted"));
    if (signal.aborted) return aborted();
    signal.addEventListener("abort", aborted, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

async function readBounded(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const advertised = response.headers.get("content-length");
  if (advertised && (!/^\d+$/.test(advertised) || Number(advertised) > maxBytes)) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("body limit");
  }
  if (!response.body) throw new Error("missing body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await abortable(reader.read(), signal);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new Error("body limit");
      chunks.push(part.value);
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

/** Explicit dependency injection: this module never reads OpenAI or environment credentials. */
export function createElevenLabsVoiceClient(input: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const timeoutMs = input.timeoutMs ?? 20_000;
  if (
    !apiKey ||
    apiKey.length > 512 ||
    !/^[!-~]+$/.test(apiKey) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 120_000
  ) {
    throw new ElevenLabsVoiceError("INVALID_INPUT", "get", false);
  }
  const fetchImpl = input.fetchImpl ?? fetch;

  async function request<T>(
    operation: Operation,
    path: string,
    init: RequestInit,
    parse: (response: Response, signal: AbortSignal) => Promise<T>,
    options: RequestOptions = {},
    missing?: () => T,
  ): Promise<T> {
    const mutating = operation === "create" || operation === "delete" || operation === "preview";
    const controller = new AbortController();
    const parentAbort = () => controller.abort();
    if (options.signal?.aborted) throw new ElevenLabsVoiceError("ABORTED", operation, false);
    options.signal?.addEventListener("abort", parentAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let sent = false;
    try {
      sent = true;
      const response = await abortable(
        fetchImpl(`${ORIGIN}${path}`, {
          ...init,
          headers: { ...init.headers, "xi-api-key": apiKey },
          redirect: "error",
          signal: controller.signal,
        }),
        controller.signal,
      );
      if (response.redirected || (response.status >= 300 && response.status < 400)) {
        void response.body?.cancel().catch(() => undefined);
        throw new ElevenLabsVoiceError(
          "PROVIDER_UNAVAILABLE",
          operation,
          mutating,
          response.status,
        );
      }
      if (response.status === 404 && missing) {
        void response.body?.cancel().catch(() => undefined);
        return missing();
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        const definiteRejection = [400, 401, 403, 404, 422].includes(response.status);
        throw new ElevenLabsVoiceError(
          definiteRejection ? "PROVIDER_REJECTED" : "PROVIDER_UNAVAILABLE",
          operation,
          mutating && !definiteRejection,
          response.status,
        );
      }
      try {
        return await parse(response, controller.signal);
      } catch {
        throw new ElevenLabsVoiceError(
          controller.signal.aborted ? "ABORTED" : "INVALID_RESPONSE",
          operation,
          mutating,
          response.status,
        );
      }
    } catch (error) {
      if (error instanceof ElevenLabsVoiceError) throw error;
      throw new ElevenLabsVoiceError(
        controller.signal.aborted ? "ABORTED" : "PROVIDER_UNAVAILABLE",
        operation,
        sent && mutating,
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", parentAbort);
    }
  }

  async function json(response: Response, signal: AbortSignal): Promise<Record<string, unknown>> {
    const data = record(
      JSON.parse(Buffer.from(await readBounded(response, MAX_JSON_BYTES, signal)).toString("utf8")),
    );
    if (!data) throw new Error("invalid object");
    return data;
  }

  function checkedId(id: string, operation: Operation): string {
    const value = voiceId(id);
    if (!value) throw new ElevenLabsVoiceError("INVALID_INPUT", operation, false);
    return value;
  }

  /** One bounded line of speech (MP3) for an owner preview or A/B. */
  async function renderPreview(id: string, line: { text: string }, options?: RequestOptions) {
    const checked = checkedId(id, "preview");
    const spoken = text(line?.text, 400);
    if (!spoken) throw new ElevenLabsVoiceError("INVALID_INPUT", "preview", false);
    return request(
      "preview",
      `/v1/text-to-speech/${checked}?output_format=${ELEVENLABS_VOICE_PREVIEW.outputFormat}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text: spoken,
          model_id: ELEVENLABS_VOICE_PREVIEW.modelId,
        }),
      },
      async (response, signal) => {
        const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
        if (mimeType !== "audio/mpeg" && mimeType !== "application/octet-stream")
          throw new Error("invalid audio type");
        const bytes = await readBounded(response, MAX_PREVIEW_BYTES, signal);
        if (
          bytes.length < 3 ||
          !(
            (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
            (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
          )
        )
          throw new Error("invalid mp3");
        // Official response metadata: /docs/api-reference/introduction.
        // Character cost is not a USD price or a promise about billed credits.
        const rawRequestId = response.headers.get("request-id");
        const rawCharacterCost = response.headers.get("character-cost");
        const requestId =
          rawRequestId && /^[A-Za-z0-9._:-]{1,200}$/.test(rawRequestId) ? rawRequestId : null;
        const characterCost =
          rawCharacterCost &&
          /^\d{1,16}$/.test(rawCharacterCost) &&
          Number.isSafeInteger(Number(rawCharacterCost))
            ? Number(rawCharacterCost)
            : null;
        return { bytes, contentType: "audio/mpeg" as const, requestId, characterCost };
      },
      options,
    );
  }

  return {
    /**
     * Read one atomic account response for provider workspace binding and
     * capabilities. Discard user identifiers, names, key previews and billing
     * details. A successful response does not authorize any tenant's voice.
     */
    async getAccountCapabilities(options?: RequestOptions): Promise<ElevenLabsAccountCapabilities> {
      return request(
        "account",
        "/v1/user",
        { method: "GET" },
        async (response, signal) => {
          const data = await json(response, signal);
          const workspaceId = voiceId(data.workspace_id);
          if (!workspaceId) throw new Error("invalid workspace identity");
          return { workspaceId, subscription: subscriptionCapabilities(data.subscription) };
        },
        options,
      );
    },

    /** Operator snapshot only: this endpoint alone cannot establish asset workspace ownership. */
    async getSubscriptionCapabilities(
      options?: RequestOptions,
    ): Promise<ElevenLabsSubscriptionCapabilities> {
      return request(
        "subscription",
        "/v1/user/subscription",
        { method: "GET" },
        async (response, signal) => subscriptionCapabilities(await json(response, signal)),
        options,
      );
    },

    async createInstantClone(clone: CloneInput, options?: RequestOptions) {
      if (!record(clone)) throw new ElevenLabsVoiceError("INVALID_INPUT", "create", false);
      const name = text(clone.name, 80);
      const description =
        clone.description === undefined ? undefined : text(clone.description, 500);
      const samples = clone.samples;
      if (
        !name ||
        description === null ||
        !Array.isArray(samples) ||
        samples.length < 1 ||
        samples.length > 3
      ) {
        throw new ElevenLabsVoiceError("INVALID_INPUT", "create", false);
      }
      let totalBytes = 0;
      for (const sample of samples) {
        if (
          !(sample?.bytes instanceof Uint8Array) ||
          !Object.hasOwn(SAMPLE_EXTENSIONS, sample.mimeType) ||
          sample.bytes.byteLength < 32 ||
          sample.bytes.byteLength > MAX_SAMPLE_BYTES
        ) {
          throw new ElevenLabsVoiceError("INVALID_INPUT", "create", false);
        }
        totalBytes += sample.bytes.byteLength;
      }
      if (totalBytes > MAX_TOTAL_SAMPLE_BYTES)
        throw new ElevenLabsVoiceError("INVALID_INPUT", "create", false);
      const form = new FormData();
      form.set("name", name);
      if (description) form.set("description", description);
      // Isolation can worsen clean recordings. It must not be silently enabled.
      form.set("remove_background_noise", "false");
      samples.forEach((sample, index) => {
        const copy = new Uint8Array(sample.bytes.byteLength);
        copy.set(sample.bytes);
        form.append(
          "files",
          new Blob([copy.buffer], { type: sample.mimeType }),
          `sample-${index + 1}.${SAMPLE_EXTENSIONS[sample.mimeType]}`,
        );
      });
      return request(
        "create",
        "/v1/voices/add",
        { method: "POST", body: form },
        async (response, signal) => {
          const data = await json(response, signal);
          const id = voiceId(data.voice_id);
          if (!id || typeof data.requires_verification !== "boolean")
            throw new Error("invalid clone");
          return { voiceId: id, requiresVerification: data.requires_verification };
        },
        options,
      );
    },

    async getVoice(id: string, options?: RequestOptions): Promise<ElevenLabsVoiceSummary | null> {
      const checked = checkedId(id, "get");
      return request(
        "get",
        `/v1/voices/${checked}`,
        { method: "GET" },
        async (response, signal) => {
          const voice = summarize(await json(response, signal));
          if (!voice || voice.voiceId !== checked) throw new Error("invalid voice");
          return voice;
        },
        options,
        () => null,
      );
    },

    async listVoices(
      page: { pageSize?: number; nextPageToken?: string } = {},
      options?: RequestOptions,
    ) {
      const pageSize = page.pageSize ?? 20;
      const token = page.nextPageToken === undefined ? undefined : text(page.nextPageToken, 2_048);
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || token === null) {
        throw new ElevenLabsVoiceError("INVALID_INPUT", "list", false);
      }
      const query = new URLSearchParams({
        page_size: String(pageSize),
        include_total_count: "false",
      });
      if (token) query.set("next_page_token", token);
      return request(
        "list",
        `/v2/voices?${query}`,
        { method: "GET" },
        async (response, signal) => {
          const data = await json(response, signal);
          // The vendor documents that page zero can include additional default
          // voices beyond page_size. Bound the page and raw JSON independently.
          if (
            !Array.isArray(data.voices) ||
            data.voices.length > 150 ||
            typeof data.has_more !== "boolean"
          )
            throw new Error("invalid page");
          const voices = data.voices.map(summarize);
          const nextPageToken =
            data.next_page_token == null ? null : text(data.next_page_token, 2_048);
          if (voices.some((voice) => !voice) || (data.has_more && !nextPageToken))
            throw new Error("invalid page");
          return {
            voices: voices as ElevenLabsVoiceSummary[],
            hasMore: data.has_more,
            nextPageToken,
          };
        },
        options,
      );
    },

    async deleteVoice(
      id: string,
      options?: RequestOptions,
    ): Promise<{ deleted: true; alreadyMissing: boolean }> {
      const checked = checkedId(id, "delete");
      return request<{ deleted: true; alreadyMissing: boolean }>(
        "delete",
        `/v1/voices/${checked}`,
        { method: "DELETE" },
        async (response, signal) => {
          if ((await json(response, signal)).status !== "ok")
            throw new Error("unconfirmed deletion");
          return { deleted: true, alreadyMissing: false } as const;
        },
        options,
        () => ({ deleted: true, alreadyMissing: true }),
      );
    },

    async renderFixedPreview(id: string, options?: RequestOptions) {
      return renderPreview(id, { text: ELEVENLABS_VOICE_PREVIEW.text }, options);
    },

    renderPreview,
  };
}
