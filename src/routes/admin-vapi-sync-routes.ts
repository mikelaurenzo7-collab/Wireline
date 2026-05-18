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
import { VAPI_PREMIUM_MODEL } from "../lib/claude-brain";

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

  return [heading, "", `You handle calls for these topics: ${agent.handles}.`, "", knowledge].join(
    "\n",
  );
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

    const assistantPayload: Record<string, any> = {
      firstMessage: agent.firstMessage,
      model: {
        provider: "anthropic",
        // Source of truth: VAPI_PREMIUM_MODEL in claude-brain.ts. Bump
        // there when the allowlist catches up to Anthropic's latest.
        model: VAPI_PREMIUM_MODEL,
        messages: [{ role: "system", content: systemPrompt }],
      },
      serverUrl: PRODUCTION_WEBHOOK_URL,
    };
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
