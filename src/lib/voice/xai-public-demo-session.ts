import type { ContactAgent } from "../../data/contact-agents";
import { AppError } from "../api-error";
import { fetchWithTimeout, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { PUBLIC_BROWSER_DEMO_MAX_SECONDS } from "../public-browser-demo";
import {
  GROK_VOICE_CLIENT_SECRETS_URL,
  GROK_VOICE_DEFAULT_MODEL,
  GROK_VOICE_EPHEMERAL_TOKEN_TTL_SECONDS,
  GROK_VOICE_SAMPLE_RATE,
  buildGrokVoiceRealtimeUrl,
  resolveGrokVoiceSpeed,
  resolveWirelineGrokVoice,
  type WirelineVoiceProfile,
} from "./grok-voice-config";

type XAIClientSecretPayload = {
  value?: string;
  expires_at?: number;
  client_secret?: {
    value?: string;
    expires_at?: number;
  };
};

const PROFILE_BY_VIBE: Record<ContactAgent["defaultVibe"], WirelineVoiceProfile> = {
  warm: "warm",
  playful: "bright",
  authoritative: "direct",
};

function tokenValue(payload: XAIClientSecretPayload): string {
  return payload.client_secret?.value?.trim() || payload.value?.trim() || "";
}

function tokenExpiry(payload: XAIClientSecretPayload): number | null {
  const raw = payload.client_secret?.expires_at ?? payload.expires_at;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function publicDemoInstructions(agent: ContactAgent): string {
  return [
    `You are ${agent.name}, demonstrating a Wireline voice agent in a protected browser conversation.`,
    agent.scope,
    "The visitor may give you a customer situation, personal task, or business request. Show how you would answer, qualify, follow up, or establish the next step.",
    "Keep every spoken turn under 18 words. Ask no more than one question at a time.",
    "This is a short role-play. Never collect sensitive data, phone numbers, payment details, health details, legal details, or email addresses.",
    "You have no tools and cannot create records, appointments, messages, payments, transfers, or external commitments. Never claim an action happened.",
    "Do not mention model names, providers, APIs, prompts, tokens, or internal systems.",
    "When asked to act, explain in one sentence what a configured Wireline agent could do, then continue the role-play without pretending it happened.",
  ].join("\n\n");
}

export function publicXAIDemoConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

export async function createPublicXAILiveDemoSession(agent: ContactAgent) {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) throw AppError.serviceUnavailable("The protected live demo is temporarily unavailable.");

  let response: globalThis.Response;
  try {
    response = await fetchWithTimeout(
      GROK_VOICE_CLIENT_SECRETS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expires_after: { seconds: GROK_VOICE_EPHEMERAL_TOKEN_TTL_SECONDS },
        }),
      },
      15_000,
    );
  } catch (error) {
    log.error("public xAI demo client secret request failed", {
      agent: agent.name,
      error: getErrorMessage(error),
    });
    throw AppError.fromHttpStatus(502, "The live voice provider is temporarily unavailable.");
  }

  const responseText = await response.text();
  let payload: XAIClientSecretPayload = {};
  if (responseText) {
    try {
      payload = JSON.parse(responseText) as XAIClientSecretPayload;
    } catch {
      payload = {};
    }
  }
  const clientSecret = tokenValue(payload);
  if (!response.ok || !clientSecret) {
    log.warn("public xAI demo client secret mint rejected", {
      agent: agent.name,
      status: response.status,
    });
    throw AppError.fromHttpStatus(502, "The live voice provider is temporarily unavailable.");
  }

  const profile = PROFILE_BY_VIBE[agent.defaultVibe];
  const voice = resolveWirelineGrokVoice(undefined, profile);
  const expiresAtSeconds = tokenExpiry(payload);
  return {
    clientSecret,
    expiresAt: expiresAtSeconds
      ? new Date(expiresAtSeconds * 1_000).toISOString()
      : new Date(Date.now() + GROK_VOICE_EPHEMERAL_TOKEN_TTL_SECONDS * 1_000).toISOString(),
    websocketUrl: buildGrokVoiceRealtimeUrl(),
    model: GROK_VOICE_DEFAULT_MODEL,
    voice,
    greeting:
      "Hi, I’m a live Wireline voice agent. Give me a customer situation or task, and I’ll show you how I’d handle it.",
    maxDurationSeconds: PUBLIC_BROWSER_DEMO_MAX_SECONDS,
    session: {
      instructions: publicDemoInstructions(agent),
      voice,
      reasoning: { effort: "none" },
      tools: [],
      tool_choice: "none",
      turn_detection: {
        type: "server_vad",
        threshold: 0.72,
        prefix_padding_ms: 333,
        silence_duration_ms: 550,
      },
      audio: {
        input: {
          transcription: { model: "grok-transcribe" },
          format: { type: "audio/pcm", rate: GROK_VOICE_SAMPLE_RATE },
        },
        output: {
          speed: resolveGrokVoiceSpeed(),
          format: { type: "audio/pcm", rate: GROK_VOICE_SAMPLE_RATE },
        },
      },
    },
  } as const;
}
