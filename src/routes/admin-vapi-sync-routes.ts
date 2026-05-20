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

import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
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

  // Call-opening protocol — uniform across every Wireline agent.
  // Mike's directive: a warm greeting, get the caller's name, get the
  // reason for the call. Nothing else up front — no pitching, no
  // "got a few minutes" (that's an OUTBOUND opener and these are all
  // INBOUND lines). The firstMessage already does the greeting + name
  // ask; this protocol makes the agent ask the reason next + use the
  // name naturally for the rest of the call.
  const openingProtocol = [
    "CALL OPENING PROTOCOL (follow exactly, every inbound call):",
    "1. You already greeted the caller warmly and asked their name in your first message.",
    '2. Once they give their name, acknowledge it warmly and use it: "Great to meet you, [name]."',
    '3. Then ask ONE open question: "What can I help you with today?"',
    '4. Do NOT pitch, do NOT say "do you have a few minutes", do NOT act like you called them. They called you.',
    "5. From there, help them with their actual reason using your scope + the knowledge below.",
  ].join("\n");

  return [
    heading,
    "",
    `You handle calls for these topics: ${agent.handles}.`,
    "",
    openingProtocol,
    "",
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
      // Strip the fake call-center ambience. Vapi's default is
      // "office" (typing + chatter loop) which is great when your
      // agent is good enough to pass for a human staffer — at our
      // current quality the ambient noise just outs the agent as
      // AI MORE clearly than silence would. Demo-line feedback from
      // Mike was unambiguous: "why are we pretending to be in a
      // human environment?" Setting "off" puts the caller on a
      // clean studio line — quieter, more clearly AI, more honest.
      backgroundSound: "off",
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

    // Showcase agents get a single platform-level tool so they can
    // actually DELIVER the signup link the playful sales line keeps
    // promising. Other tenant-scoped tools (send_email via tenant
    // OAuth, search_leads, etc.) come from the standard Vapi webhook
    // handler — they're not advertised here because showcase agents
    // have no tenant context. See vapi-routes.ts:248-320 for the
    // server-side dispatch.
    assistantPayload.model.tools = [
      {
        type: "function",
        function: {
          name: "send_signup_link",
          description:
            "Send the caller a Wireline 14-day trial sign-up link via email. Use when a caller says: 'send me the link', 'email me the signup', 'how do I try this', 'can I get more info'. " +
            "MANDATORY EMAIL CONFIRMATION before you call this tool: (1) ask 'What's the best email for that?', " +
            "(2) read the FULL address back slowly, spelling out anything ambiguous — e.g. 'that's j-o-h-n at gmail dot com, correct?', " +
            "(3) wait for an explicit 'yes' / 'correct'. If they correct you, read it back AGAIN and re-confirm. " +
            "Only call this tool once the caller has explicitly confirmed the spelling. Never send to an unconfirmed address. " +
            "Never claim an email was sent without invoking this tool.",
          parameters: {
            type: "object",
            properties: {
              to_email: {
                type: "string",
                description:
                  "The caller's email address — ONLY pass this after the caller has explicitly confirmed you read it back correctly. Must be a valid RFC-5322 email (foo@bar.com). If the caller spelled it letter-by-letter, reconstruct it, read it back, and confirm before passing.",
              },
              email_confirmed: {
                type: "boolean",
                description:
                  "Set true ONLY after you read the address back to the caller and they explicitly confirmed it. If you have not confirmed, set false and the link will not be sent.",
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
      {
        type: "function",
        function: {
          name: "create_account",
          description:
            "Sign the caller up for a Wireline account RIGHT NOW, on the call. Use when a caller says: 'sign me up', 'create my account', 'I want to get started', 'set me up'. This actually creates their account + emails them a link to set their password — their 14-day free trial starts immediately. " +
            "MANDATORY EMAIL CONFIRMATION first: ask for the best email, read the FULL address back spelling anything ambiguous ('j-o-h-n at gmail dot com, correct?'), wait for an explicit yes. Only call this once they've confirmed.",
          parameters: {
            type: "object",
            properties: {
              to_email: {
                type: "string",
                description:
                  "The caller's email — only pass after they've explicitly confirmed you read it back correctly. Valid RFC-5322 email.",
              },
              caller_name: {
                type: "string",
                description:
                  "The caller's name, for their account profile + the welcome email. Optional.",
              },
              email_confirmed: {
                type: "boolean",
                description:
                  "Set true ONLY after you read the address back and the caller confirmed it. False = the account will not be created.",
              },
            },
            required: ["to_email"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "send_payment_link",
          description:
            "Email the caller a secure link to pay for + activate a Wireline plan. Use when a caller is ready to buy and asks to pay, or wants the checkout link. " +
            "Confirm the email address out loud first (read it back, get an explicit yes), same as the other email tools.",
          parameters: {
            type: "object",
            properties: {
              to_email: {
                type: "string",
                description: "The caller's confirmed email address. Valid RFC-5322 email.",
              },
              plan: {
                type: "string",
                description:
                  "Which plan they want, lowercase: 'personal', 'starter', 'pro', or 'business'. Optional — omit if they haven't picked one yet.",
              },
              email_confirmed: {
                type: "boolean",
                description:
                  "True only after you read the address back and the caller confirmed it.",
              },
            },
            required: ["to_email"],
          },
        },
      },
    ];

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

// Permissive middleware — only runs authenticateUser when a Bearer
// token is present, so the X-Migration-Token path below works for
// ops/CI without an interactive session.
function syncOptionalAuth(req: Request, res: Response, next: NextFunction) {
  const hasBearer = (req.headers.authorization || "").startsWith("Bearer ");
  if (!hasBearer) return next();
  return (authenticateUser as any)(req, res, next);
}

router.post(
  "/api/admin/sync-vapi-knowledge",
  syncOptionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    // Authorize via owner-email session OR X-Migration-Token header.
    const provided = req.headers["x-migration-token"] as string | undefined;
    const expected = process.env.MIGRATION_TOKEN;
    const tokenOk = !!(
      provided &&
      expected &&
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    );
    const ownerEmail = process.env.OWNER_EMAIL;
    const ownerOk = !!(ownerEmail && req.user?.email === ownerEmail);
    if (!tokenOk && !ownerOk) {
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
        userId: req.user?.id || "migration-token",
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
