import { createHash } from "node:crypto";

export type OpenAIRealtimeKeyPurpose = "runtime" | "chatgpt_demo";
export type OpenAIRealtimeKeySource = "runtime" | "chatgpt_demo";

export type OpenAIRealtimeKeyEnvironment = {
  OPENAI_API_KEY?: string;
  OPENAI_API_KEY_PREVIOUS?: string;
  OPENAI_API_KEY_CHATKIT?: string;
  OPENAI_API_KEY_CHATKIT_PREVIOUS?: string;
};

export type OpenAIRealtimeKeyMaterial = {
  value: string;
  source: OpenAIRealtimeKeySource;
  fingerprint: string;
  generation: "current" | "previous";
};

export function openAIRealtimeKeyFingerprint(apiKey: string): string {
  return createHash("sha256")
    .update("botbound:openai-realtime-key:v1:")
    .update(apiKey)
    .digest("hex")
    .slice(0, 24);
}

function sourceAllowedForPurpose(
  purpose: OpenAIRealtimeKeyPurpose,
  source: OpenAIRealtimeKeySource,
): boolean {
  return purpose === "chatgpt_demo" || source === "runtime";
}

export function openAIRealtimeSourceForPurpose(
  env: OpenAIRealtimeKeyEnvironment,
  purpose: OpenAIRealtimeKeyPurpose,
  requiredSource?: OpenAIRealtimeKeySource,
): OpenAIRealtimeKeySource | null {
  if (requiredSource) {
    return sourceAllowedForPurpose(purpose, requiredSource) ? requiredSource : null;
  }
  return purpose === "chatgpt_demo" && env.OPENAI_API_KEY_CHATKIT?.trim()
    ? "chatgpt_demo"
    : "runtime";
}

function valueForSource(
  env: OpenAIRealtimeKeyEnvironment,
  source: OpenAIRealtimeKeySource,
  generation: "current" | "previous",
): string {
  if (source === "chatgpt_demo") {
    return (
      (generation === "current"
        ? env.OPENAI_API_KEY_CHATKIT
        : env.OPENAI_API_KEY_CHATKIT_PREVIOUS
      )?.trim() || ""
    );
  }
  return (
    (generation === "current" ? env.OPENAI_API_KEY : env.OPENAI_API_KEY_PREVIOUS)?.trim() || ""
  );
}

function keyMaterial(
  env: OpenAIRealtimeKeyEnvironment,
  source: OpenAIRealtimeKeySource,
  generation: "current" | "previous",
): OpenAIRealtimeKeyMaterial | null {
  const value = valueForSource(env, source, generation);
  return value
    ? {
        value,
        source,
        fingerprint: openAIRealtimeKeyFingerprint(value),
        generation,
      }
    : null;
}

/** New calls may use only the current key. Previous keys are hangup-only. */
export function selectCurrentOpenAIRealtimeKey(
  env: OpenAIRealtimeKeyEnvironment,
  purpose: OpenAIRealtimeKeyPurpose,
  requiredSource?: OpenAIRealtimeKeySource,
): OpenAIRealtimeKeyMaterial | null {
  const source = openAIRealtimeSourceForPurpose(env, purpose, requiredSource);
  return source ? keyMaterial(env, source, "current") : null;
}

/**
 * A previous key is eligible only for an already-created call whose durable
 * payload contains the exact matching fingerprint and source. This prevents a
 * rotation from stranding the hangup while prohibiting cross-source fallback
 * or use of an old credential for new calls.
 */
export function selectOpenAIRealtimeHangupKey(
  env: OpenAIRealtimeKeyEnvironment,
  input: {
    purpose: OpenAIRealtimeKeyPurpose;
    requiredSource?: OpenAIRealtimeKeySource;
    expectedFingerprint?: string;
  },
): OpenAIRealtimeKeyMaterial | null {
  const source = openAIRealtimeSourceForPurpose(env, input.purpose, input.requiredSource);
  if (!source) return null;

  const current = keyMaterial(env, source, "current");
  if (!input.expectedFingerprint) return current;
  if (current?.fingerprint === input.expectedFingerprint) return current;

  const previous = keyMaterial(env, source, "previous");
  return previous?.fingerprint === input.expectedFingerprint ? previous : null;
}
