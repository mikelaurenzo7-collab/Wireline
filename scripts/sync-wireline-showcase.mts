#!/usr/bin/env tsx
/**
 * Push the source-controlled public showcase prompts and speech pipeline to all
 * Wireline public lines.
 *
 * The script preflights every number and assistant before performing any PATCH.
 * It is deterministic and idempotent, but external APIs are not transactional;
 * a failed PATCH exits non-zero so the production deployment does not certify a
 * partially synchronized public fleet.
 *
 * Usage:
 *   VAPI_PRIVATE_KEY=… VAPI_WEBHOOK_SECRET=… npx tsx scripts/sync-wireline-showcase.mts
 */

import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../src/data/contact-agents.ts";
import {
  buildShowcaseAssistantPayload,
  SHOWCASE_WEBHOOK_URL,
} from "../src/lib/showcase-assistant.ts";
import { sanitizeShowcaseAssistantPayload } from "../src/lib/showcase-prompt-truth-guard.ts";
import { sanitizePhone } from "../src/lib/vapi-helpers.ts";
import { VAPI_OPENAI_FALLBACK_MODEL } from "../src/lib/ai-models.ts";

const VAPI_BASE = "https://api.vapi.ai";
const PATCH_DELAY_MS = 600;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type VapiNumber = {
  id: string;
  number?: string | null;
  assistantId?: string | null;
};

type SyncTarget = {
  agent: ContactAgent;
  kind: "cs" | "demo";
  tel: string;
  numberId: string;
  assistantId: string;
  payload: Record<string, unknown>;
};

type SyncResult = {
  agent: string;
  tel: string;
  status: "patched" | "failed";
  assistantId: string;
  transcriber?: string;
  reason?: string;
};

async function vapiFetch(path: string, init?: RequestInit): Promise<any> {
  const key = process.env.VAPI_PRIVATE_KEY?.trim();
  if (!key) throw new Error("VAPI_PRIVATE_KEY not set");
  const response = await fetch(`${VAPI_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await response.text();
  let parsed: any = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    // Error reporting below includes the bounded raw body.
  }
  if (!response.ok) {
    const message = parsed?.message
      ? Array.isArray(parsed.message)
        ? parsed.message.join("; ")
        : parsed.message
      : body.slice(0, 300);
    throw new Error(`Vapi ${response.status}: ${message}`);
  }
  return parsed;
}

async function patchAssistant(assistantId: string, payload: Record<string, unknown>) {
  try {
    await vapiFetch(`/assistant/${assistantId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const model = (payload.model as any)?.provider;
    if (model !== "google") throw error;
    const fallback = {
      ...payload,
      model: {
        ...(payload.model as object),
        provider: "openai",
        model: VAPI_OPENAI_FALLBACK_MODEL,
      },
    };
    delete (fallback.model as any).fallbackModels;
    await vapiFetch(`/assistant/${assistantId}`, {
      method: "PATCH",
      body: JSON.stringify(fallback),
    });
  }
}

function publicCatalog(): Array<{ agent: ContactAgent; kind: "cs" | "demo" }> {
  return [
    ...WIRELINE_CONTACT_AGENTS.map((agent) => ({ agent, kind: "cs" as const })),
    ...WIRELINE_DEMO_AGENTS.map((agent) => ({ agent, kind: "demo" as const })),
  ];
}

function preflightTargets(numbers: VapiNumber[], webhookSecret: string): SyncTarget[] {
  const lookup = new Map<string, VapiNumber>();
  for (const number of numbers) {
    const normalized = number.number ? sanitizePhone(number.number) || number.number : "";
    if (normalized) lookup.set(normalized, number);
  }

  const missing: string[] = [];
  const targets: SyncTarget[] = [];
  for (const { agent, kind } of publicCatalog()) {
    const tel = sanitizePhone(agent.tel) || agent.tel;
    const number = lookup.get(tel);
    if (!number) {
      missing.push(`${agent.name} ${agent.tel}: no Vapi number`);
      continue;
    }
    if (!number.assistantId) {
      missing.push(`${agent.name} ${agent.tel}: number has no assistantId`);
      continue;
    }

    const payload = sanitizeShowcaseAssistantPayload(
      buildShowcaseAssistantPayload(agent, kind, {
        webhookSecret,
      }) as Record<string, unknown>,
    );
    targets.push({
      agent,
      kind,
      tel,
      numberId: number.id,
      assistantId: number.assistantId,
      payload,
    });
  }

  if (missing.length) {
    throw new Error(`Showcase preflight failed before provider mutation:\n- ${missing.join("\n- ")}`);
  }
  if (targets.length !== publicCatalog().length) {
    throw new Error(
      `Showcase preflight expected ${publicCatalog().length} targets and built ${targets.length}.`,
    );
  }
  if (new Set(targets.map((target) => target.numberId)).size !== targets.length) {
    throw new Error("Showcase preflight found duplicate Vapi number assignments.");
  }
  if (new Set(targets.map((target) => target.assistantId)).size !== targets.length) {
    throw new Error("Showcase preflight found duplicate assistant assignments.");
  }

  return targets;
}

async function syncOne(target: SyncTarget, webhookSecret: string): Promise<SyncResult> {
  try {
    await patchAssistant(target.assistantId, target.payload);

    await vapiFetch(`/phone-number/${target.numberId}`, {
      method: "PATCH",
      body: JSON.stringify({
        server: {
          url: SHOWCASE_WEBHOOK_URL,
          secret: webhookSecret,
        },
      }),
    });

    return {
      agent: target.agent.name,
      tel: target.agent.tel,
      status: "patched",
      assistantId: target.assistantId,
      transcriber: (target.payload.transcriber as any)?.model,
    };
  } catch (error) {
    return {
      agent: target.agent.name,
      tel: target.agent.tel,
      status: "failed",
      assistantId: target.assistantId,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const webhookSecret = process.env.VAPI_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) throw new Error("VAPI_WEBHOOK_SECRET not set");

  const response = await vapiFetch("/phone-number?limit=100");
  if (!Array.isArray(response)) throw new Error("Vapi phone-number response was not an array.");
  const targets = preflightTargets(response as VapiNumber[], webhookSecret);

  console.log(`Showcase preflight passed for ${targets.length} public lines.`);
  const results: SyncResult[] = [];
  for (const target of targets) {
    results.push(await syncOne(target, webhookSecret));
    await sleep(PATCH_DELAY_MS);
  }

  const counts = { patched: 0, failed: 0 };
  for (const result of results) {
    counts[result.status]++;
    const icon = result.status === "patched" ? "✓" : "✗";
    const extra =
      result.status === "patched"
        ? ` → ${result.transcriber || "transcriber configured"}`
        : result.reason
          ? ` (${result.reason})`
          : "";
    console.log(`  ${icon} ${result.agent} ${result.tel}${extra}`);
  }

  console.log("\nSummary:", counts);
  if (counts.failed > 0 || counts.patched !== targets.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
