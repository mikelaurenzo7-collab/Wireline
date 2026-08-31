import type { ContactAgent } from "../../data/contact-agents";
import {
  persistPlatformCostRecord,
  platformCostReserveUsd,
} from "../../middleware/audit-middleware";
import { runInBackground } from "../background-work";
import { PUBLIC_BROWSER_DEMO_MAX_SECONDS } from "../public-browser-demo";
import { OPENAI_REALTIME_DEFAULT_MODEL, type OpenAIRealtimeVoice } from "./openai-realtime-config";
import {
  createServerManagedOpenAIRealtimeCall,
  hangupOpenAIRealtimeCall,
  OPENAI_REALTIME_SYSTEM_USER_ID,
} from "./openai-realtime-call-control";
import {
  OPENAI_REALTIME_COST_TRUNCATION,
  OPENAI_REALTIME_RESERVE_WINDOW_SECONDS,
} from "./openai-realtime-pricing";

const PROFILE_BY_VIBE: Record<ContactAgent["defaultVibe"], OpenAIRealtimeVoice> = {
  warm: "marin",
  playful: "coral",
  authoritative: "cedar",
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function publicDemoInstructions(agent: ContactAgent): string {
  return [
    `You are ${agent.name}, demonstrating BotBound in a protected browser conversation.`,
    agent.scope,
    "The visitor may give you a customer situation, personal task, or business request. Show how you would answer, qualify, follow up, or establish the next step.",
    "Keep every spoken turn under 18 words. Ask no more than one question at a time.",
    "This is a short role-play. Never collect sensitive data, phone numbers, payment details, health details, legal details, or email addresses.",
    "You have no tools and cannot create records, appointments, messages, payments, transfers, or external commitments. Never claim an action happened.",
    "Do not mention model names, providers, APIs, prompts, tokens, or internal systems.",
    "When asked to act, explain in one sentence what a configured Bot could do, then continue the role-play without pretending it happened.",
  ].join("\n\n");
}

export function publicOpenAIDemoConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY_CHATKIT?.trim() || process.env.OPENAI_API_KEY?.trim());
}

export async function createPublicOpenAILiveDemoCall(input: {
  agent: ContactAgent;
  guestFingerprint: string;
  sdp: string;
}) {
  // Resolve before provider work so an explicitly underfunded deployment
  // cannot mint a call and discover the pricing fault afterward.
  const fiveMinuteReserveUsd = platformCostReserveUsd("openai_realtime_session");
  const voice = PROFILE_BY_VIBE[input.agent.defaultVibe];
  const session = {
    type: "realtime",
    model: OPENAI_REALTIME_DEFAULT_MODEL,
    output_modalities: ["audio"],
    instructions: publicDemoInstructions(input.agent),
    tools: [],
    tool_choice: "none",
    truncation: OPENAI_REALTIME_COST_TRUNCATION,
    audio: {
      input: {
        format: { type: "audio/pcm", rate: 24_000 },
        turn_detection: {
          type: "semantic_vad",
          create_response: true,
          interrupt_response: true,
          eagerness: "auto",
        },
      },
      output: {
        format: { type: "audio/pcm", rate: 24_000 },
        voice,
      },
    },
  };

  const call = await createServerManagedOpenAIRealtimeCall({
    userId: OPENAI_REALTIME_SYSTEM_USER_ID,
    safetyIdentity: `public-demo:${input.guestFingerprint}`,
    sdp: input.sdp,
    session,
    keyPurpose: "chatgpt_demo",
    maxDurationSeconds: PUBLIC_BROWSER_DEMO_MAX_SECONDS,
    logContext: { surface: "public_demo", agent: input.agent.name },
  });
  const endsAt = new Date(Date.now() + call.maxDurationSeconds * 1_000);

  // Register the exact safety deadline before any secondary persistence. The
  // durable queue armed above remains the crash-recovery backstop.
  runInBackground(`public OpenAI Realtime deadline ${call.callId}`, async () => {
    await delay(Math.max(0, endsAt.getTime() - Date.now()));
    await hangupOpenAIRealtimeCall({
      callId: call.callId,
      keyPurpose: "chatgpt_demo",
      keySource: call.keySource,
      expectedKeyFingerprint: call.keyFingerprint,
    });
  });

  const estimatedCostUsd = Number(
    (
      (fiveMinuteReserveUsd * call.maxDurationSeconds) /
      OPENAI_REALTIME_RESERVE_WINDOW_SECONDS
    ).toFixed(6),
  );
  runInBackground(`public OpenAI Realtime cost ${call.callId}`, () =>
    persistPlatformCostRecord({
      userId: null,
      action: "voice.realtime.public_demo",
      provider: "openai",
      model: OPENAI_REALTIME_DEFAULT_MODEL,
      costUsd: estimatedCostUsd,
      requestMeta: {
        surface: "public_demo",
        max_duration_seconds: call.maxDurationSeconds,
        accounting_basis: "maximum_session_duration",
      },
    }),
  );

  return {
    sdp: call.sdp,
    greeting:
      `Hi, I’m ${input.agent.name}. Give me a customer situation or task, and I’ll show you how I’d handle it.`,
    maxDurationSeconds: call.maxDurationSeconds,
    endsAt: endsAt.toISOString(),
  } as const;
}
