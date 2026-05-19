/**
 * Owner-only endpoint that synchronizes Wireline knowledge + customer-
 * service playbook into the live Vapi assistants behind the 10
 * landing-page numbers.
 *
 * For each phone number in WIRELINE_CONTACT_AGENTS + WIRELINE_DEMO_AGENTS:
 *   1. Look up the Vapi assistant currently attached to that number.
 *   2. PATCH the assistant with:
 *        - new firstMessage (per-agent)
 *        - new system prompt: original role prompt + Wireline knowledge block
 *        - serverUrl pinned to https://trywireline.com/api/vapi-webhook
 *        - serverUrlSecret carried over from env
 *   3. PATCH the phone number itself to point serverUrl at trywireline.com
 *      (covers the case where the number has its own webhook override).
 *
 * Safe to re-run — last write wins and the operation is idempotent. The
 * endpoint returns a per-number report (skipped / patched / failed) so
 * the operator can see exactly what changed.
 *
 * Auth: requesting user's email must match OWNER_EMAIL env var.
 */

import { Router, Response } from "express";
import { log } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";
import { listVapiNumbers } from "../lib/vapi-phone-numbers";
import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../data/contact-agents";
import { buildWirelineKnowledgeBlock } from "../data/wireline-knowledge";
import { sanitizePhone } from "../lib/vapi-helpers";
import { VAPI_SHOWCASE_MODEL } from "../lib/claude-brain";
import { buildVibeBlock } from "../lib/personality-vibes";

const router = Router();

const VAPI_BASE = "https://api.vapi.ai";
const PRODUCTION_WEBHOOK_URL = "https://trywireline.com/api/vapi-webhook";

interface AgentSyncResult {
  agent: string;
  display: string;
  tel: string;
  assistantId?: string;
  status: "patched" | "skipped" | "failed";
  reason?: string;
}

async function vapiFetch(path: string, init?: RequestInit): Promise<any> {
  const key = process.env.VAPI_PRIVATE_KEY;
  if (!key) throw new Error("VAPI_PRIVATE_KEY not configured");
  const res = await fetch(`${VAPI_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await res.text();
  let parsed: any = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    /* leave parsed null */
  }
  if (!res.ok) {
    const msg = parsed?.message
      ? Array.isArray(parsed.message)
        ? parsed.message.join("; ")
        : parsed.message
      : body.slice(0, 200);
    throw new Error(`Vapi ${res.status}: ${msg}`);
  }
  return parsed;
}

function buildSystemPromptForAgent(agent: ContactAgent, kind: "cs" | "demo"): string {
  const knowledge = buildWirelineKnowledgeBlock(kind);
  const heading =
    kind === "cs"
      ? `You are ${agent.name}, a Wireline customer-service agent. Your scope: ${agent.scope}`
      : `You are ${agent.name}, a Wireline demo agent role-playing: ${agent.role}. Scope: ${agent.scope}. When the caller asks about Wireline (the platform you're built on), answer using the WIRELINE KNOWLEDGE block below.`;

  // Vibe block — the moat. Every showcase agent ships with its
  // assigned vibe (Sarah/Tyler/Devon/Priya = warm, Liam/Maya/Aisha/
  // Jake = playful, Marcus/Elena = authoritative). The block also
  // injects the always-on adaptive+quick core, so the showcase
  // agents are demonstrably more dynamic than competitor demos.
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

async function syncOneAgent(
  agent: ContactAgent,
  kind: "cs" | "demo",
  numberLookup: Map<string, { id: string; assistantId?: string | null }>,
): Promise<AgentSyncResult> {
  const e164 = sanitizePhone(agent.tel) || agent.tel;
  const numEntry = numberLookup.get(e164);

  if (!numEntry) {
    return {
      agent: agent.name,
      display: agent.display,
      tel: agent.tel,
      status: "skipped",
      reason: "no Vapi number matches this tel",
    };
  }
  if (!numEntry.assistantId) {
    return {
      agent: agent.name,
      display: agent.display,
      tel: agent.tel,
      status: "skipped",
      reason: "Vapi number has no assistantId attached",
    };
  }

  try {
    // 1. PATCH the assistant — first message + system prompt + serverUrl.
    const systemPrompt = buildSystemPromptForAgent(agent, kind);

    // Vapi's system prompt cap is ~32k chars. Reject above 30k so we
    // never silent-fail a sync; the caller sees a clear error per agent
    // and the operator knows to trim the knowledge file.
    const MAX_PROMPT_CHARS = 30_000;
    if (systemPrompt.length > MAX_PROMPT_CHARS) {
      return {
        agent: agent.name,
        display: agent.display,
        tel: agent.tel,
        assistantId: numEntry.assistantId,
        status: "failed",
        reason: `prompt ${systemPrompt.length} chars exceeds ${MAX_PROMPT_CHARS} cap — trim wireline-knowledge.ts`,
      };
    }

    // Vapi PATCH replaces sub-objects wholesale — so we first GET the
    // current voice config to preserve the per-assistant voiceId
    // (Sarah's voice ≠ Liam's voice etc.) while still updating the
    // streaming-latency knob.
    let existingVoiceId: string | undefined;
    try {
      const cur = await fetch(`https://api.vapi.ai/assistant/${numEntry.assistantId}`, {
        headers: { Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}` },
      });
      if (cur.ok) {
        const curJson = (await cur.json()) as Record<string, any>;
        existingVoiceId = curJson?.voice?.voiceId;
      }
    } catch {
      // Fall through — if the GET fails, we leave voice out of the
      // payload and the existing config stays as-is.
    }

    const assistantPayload: Record<string, any> = {
      firstMessage: agent.firstMessage,
      model: {
        // Sonnet for the showcase demos — half the first-token latency
        // of Opus, plenty smart enough to follow vibe directives on a
        // phone call. Source of truth in claude-brain.ts.
        provider: "anthropic",
        model: VAPI_SHOWCASE_MODEL,
        messages: [{ role: "system", content: systemPrompt }],
      },
      serverUrl: PRODUCTION_WEBHOOK_URL,
      // Latency tuning — every knob set to the fastest value that
      // still preserves polite turn-taking. The total perceptual
      // reply-delay reduction vs. Vapi defaults is roughly:
      //   model swap (Opus → Sonnet) …………… ~350ms
      //   endpointing 150 → 50ms …………………… ~100ms
      //   startSpeakingPlan 0.25 → 0.1 …… ~150ms
      //   optimizeStreamingLatency 3 → 4 ~ 75ms
      //   ───────────────────────────────────
      //   ≈ 675ms faster perceived response
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

    // Only include the voice block if we successfully fetched the
    // existing voiceId — Vapi PATCH would otherwise wipe it.
    if (existingVoiceId) {
      assistantPayload.voice = {
        provider: "11labs",
        voiceId: existingVoiceId,
        model: "eleven_flash_v2_5",
        optimizeStreamingLatency: 4,
      };
    }
    // Carry the webhook secret if it's set — Vapi requires it for signature checks.
    if (process.env.VAPI_WEBHOOK_SECRET) {
      assistantPayload.serverUrlSecret = process.env.VAPI_WEBHOOK_SECRET;
    }
    await vapiFetch(`/assistant/${numEntry.assistantId}`, {
      method: "PATCH",
      body: JSON.stringify(assistantPayload),
    });

    // 2. PATCH the phone number — server override pinned to trywireline.com.
    //    Some numbers have a number-level webhook override that beats the
    //    assistant's; setting it here keeps everything pointed at prod.
    const numberPayload: Record<string, any> = {
      server: { url: PRODUCTION_WEBHOOK_URL },
    };
    if (process.env.VAPI_WEBHOOK_SECRET) {
      numberPayload.server.secret = process.env.VAPI_WEBHOOK_SECRET;
    }
    await vapiFetch(`/phone-number/${numEntry.id}`, {
      method: "PATCH",
      body: JSON.stringify(numberPayload),
    });

    return {
      agent: agent.name,
      display: agent.display,
      tel: agent.tel,
      assistantId: numEntry.assistantId,
      status: "patched",
    };
  } catch (e: any) {
    return {
      agent: agent.name,
      display: agent.display,
      tel: agent.tel,
      assistantId: numEntry.assistantId ?? undefined,
      status: "failed",
      reason: e?.message || String(e),
    };
  }
}

router.post(
  "/api/admin/sync-vapi-knowledge",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail || req.user?.email !== ownerEmail) {
      return res.status(403).json({ error: "Owner only." });
    }
    if (!process.env.VAPI_PRIVATE_KEY) {
      return res.status(503).json({ error: "VAPI_PRIVATE_KEY not configured" });
    }

    try {
      // One Vapi number list → map e164 → { id, assistantId } for O(1) lookup.
      const numbers = await listVapiNumbers();
      const lookup = new Map<string, { id: string; assistantId?: string | null }>();
      for (const n of numbers) {
        if (n.number) lookup.set(n.number, { id: n.id, assistantId: n.assistantId });
      }

      const results: AgentSyncResult[] = [];
      for (const a of WIRELINE_CONTACT_AGENTS) {
        results.push(await syncOneAgent(a, "cs", lookup));
      }
      for (const a of WIRELINE_DEMO_AGENTS) {
        results.push(await syncOneAgent(a, "demo", lookup));
      }

      const counts = results.reduce(
        (acc, r) => {
          acc[r.status]++;
          return acc;
        },
        { patched: 0, skipped: 0, failed: 0 } as Record<string, number>,
      );

      log.info("Vapi knowledge sync completed", {
        userId: req.user.id,
        counts,
      });

      return res.json({
        ok: true,
        webhookUrl: PRODUCTION_WEBHOOK_URL,
        counts,
        results,
      });
    } catch (e: any) {
      log.error("Vapi knowledge sync failed", { error: e?.message });
      return res.status(500).json({ error: e?.message || "Sync failed" });
    }
  },
);

export default router;
