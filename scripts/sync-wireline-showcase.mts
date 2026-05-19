/**
 * One-shot operator script — sync the 10 Wireline showcase + demo
 * Vapi assistants with the latest system prompt (vibe + adaptive
 * core + Wireline knowledge) and the latency knobs.
 *
 * Run:
 *   VAPI_PRIVATE_KEY=… npx tsx scripts/sync-wireline-showcase.mts
 *
 * Reuses the same builder functions the auth-gated
 * /api/admin/sync-vapi-knowledge endpoint uses, so the output is
 * byte-identical with the in-product sync — minus the JWT gate.
 */

import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../src/data/contact-agents";
import { buildWirelineKnowledgeBlock } from "../src/data/wireline-knowledge";
import { buildVibeBlock } from "../src/lib/personality-vibes";
import { VAPI_SHOWCASE_MODEL } from "../src/lib/claude-brain";

const VAPI_KEY = process.env.VAPI_PRIVATE_KEY;
if (!VAPI_KEY) {
  console.error("Missing VAPI_PRIVATE_KEY env var.");
  process.exit(1);
}

const PRODUCTION_WEBHOOK_URL = "https://trywireline.com/api/vapi-webhook";

function sanitize(tel: string): string {
  return "+" + String(tel).replace(/[^0-9]/g, "");
}

function buildSystemPromptForAgent(agent: ContactAgent, kind: "cs" | "demo"): string {
  const knowledge = buildWirelineKnowledgeBlock(kind);
  const heading =
    kind === "cs"
      ? `You are ${agent.name}, a Wireline customer-service agent. Your scope: ${agent.scope}`
      : `You are ${agent.name}, a Wireline demo agent role-playing: ${agent.role}. Scope: ${agent.scope}. When the caller asks about Wireline (the platform you're built on), answer using the WIRELINE KNOWLEDGE block below.`;

  const vibe = buildVibeBlock(agent.defaultVibe);

  return [
    heading,
    "",
    `You handle calls for these topics: ${agent.handles}.`,
    vibe,
    "",
    knowledge,
  ].join("\n");
}

async function main() {
  console.log("Fetching live Vapi numbers…");
  const numbersRes = await fetch("https://api.vapi.ai/phone-number", {
    headers: { Authorization: `Bearer ${VAPI_KEY}` },
  });
  if (!numbersRes.ok) {
    console.error("Vapi /phone-number failed:", numbersRes.status, await numbersRes.text());
    process.exit(1);
  }
  const numbers = (await numbersRes.json()) as Array<{
    number?: string;
    assistantId?: string;
  }>;
  console.log(`  ${numbers.length} numbers in the account.`);

  // Index by E.164
  const byTel = new Map<string, string>();
  for (const n of numbers) {
    if (n.number && n.assistantId) byTel.set(sanitize(n.number), n.assistantId);
  }

  const all = [
    ...WIRELINE_CONTACT_AGENTS.map((a) => ({ a, kind: "cs" as const })),
    ...WIRELINE_DEMO_AGENTS.map((a) => ({ a, kind: "demo" as const })),
  ];

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const { a, kind } of all) {
    const tel = sanitize(a.tel);
    const assistantId = byTel.get(tel);
    if (!assistantId) {
      console.log(`  SKIP ${a.name.padEnd(8)} (${a.display}) — no matching Vapi number`);
      skipped++;
      continue;
    }

    const systemPrompt = buildSystemPromptForAgent(a, kind);
    if (systemPrompt.length > 30_000) {
      console.log(
        `  FAIL ${a.name.padEnd(8)} (${a.display}) — prompt ${systemPrompt.length}c exceeds 30k cap`,
      );
      failed++;
      continue;
    }

    // Preserve the per-assistant voiceId (Sarah ≠ Liam ≠ Marcus).
    // Vapi PATCH replaces sub-objects wholesale, so we must GET first.
    let existingVoiceId: string | undefined;
    try {
      const cur = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
        headers: { Authorization: `Bearer ${VAPI_KEY}` },
      });
      if (cur.ok) {
        const curJson = (await cur.json()) as Record<string, any>;
        existingVoiceId = curJson?.voice?.voiceId;
      }
    } catch {
      // If GET fails, leave voice out of payload — existing config persists.
    }

    const payload: Record<string, any> = {
      firstMessage: a.firstMessage,
      model: {
        provider: "anthropic",
        // Sonnet on the showcase line — half the first-token latency
        // of Opus, plenty smart for vibe-directed receptionist work.
        model: VAPI_SHOWCASE_MODEL,
        messages: [{ role: "system", content: systemPrompt }],
      },
      serverUrl: PRODUCTION_WEBHOOK_URL,
      // Full latency-knob suite. Total perceived reply-delay shaved
      // vs. Vapi defaults: ~675ms (model + endpointing +
      // startSpeakingPlan + optimizeStreamingLatency).
      responseDelaySeconds: 0,
      numWordsToInterruptAssistant: 2,
      backgroundDenoisingEnabled: false,
      startSpeakingPlan: {
        waitSeconds: 0.1,
        smartEndpointingPlan: { provider: "livekit", waitFunction: "20 + 8000 * x" },
      },
      transcriber: {
        provider: "deepgram",
        model: "nova-3",
        language: "en",
        endpointing: 50,
      },
    };

    // Same tool list as the in-product sync route (kept in lockstep).
    // Showcase agents need the platform-Resend signup-link tool so
    // they can actually deliver the email the caller asks for —
    // tenant-scoped tools (send_email via OAuth, search_leads, etc.)
    // require a tenant context the showcase agents don't have.
    (payload.model as Record<string, any>).tools = [
      {
        type: "function",
        function: {
          name: "send_signup_link",
          description:
            "Send the caller a Wireline 14-day trial sign-up link via email. Use this immediately when a caller says any of: 'send me the link', 'email me the signup', 'text me details', 'how do I try this', 'can I get more info'. Capture the email by asking 'What's the best email?' if you don't have it. Confirm the address back to the caller before sending. ALWAYS use this tool — never claim to send anything by mouth without invoking it.",
          parameters: {
            type: "object",
            properties: {
              to_email: {
                type: "string",
                description:
                  "The caller's email address, parsed from the conversation. Must be a valid RFC-5322 email (foo@bar.com). If the caller spelled it letter-by-letter, reconstruct it before passing.",
              },
              caller_name: {
                type: "string",
                description:
                  "The caller's first name if you have it (used in the email greeting). Optional — pass undefined if you didn't catch it.",
              },
            },
            required: ["to_email"],
          },
        },
      },
    ];

    if (existingVoiceId) {
      payload.voice = {
        provider: "11labs",
        voiceId: existingVoiceId,
        model: "eleven_flash_v2_5",
        optimizeStreamingLatency: 4,
      };
    }

    const r = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${VAPI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.log(
        `  FAIL ${a.name.padEnd(8)} (${a.display}) — ${r.status} ${errText.slice(0, 160)}`,
      );
      failed++;
      continue;
    }

    console.log(
      `  OK   ${a.name.padEnd(8)} (${a.display}) — vibe=${a.defaultVibe.padEnd(13)} prompt=${systemPrompt.length}c`,
    );
    synced++;
  }

  console.log(`\nDone. synced=${synced} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error("Script crashed:", e);
  process.exit(1);
});
