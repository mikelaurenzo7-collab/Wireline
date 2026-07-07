#!/usr/bin/env tsx
/**
 * Push showcase prompts + Liam-identical Flux STT to every Wireline
 * public line (employees + demo agents).
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
import { sanitizePhone } from "../src/lib/vapi-helpers.ts";
import { VAPI_OPENAI_FALLBACK_MODEL } from "../src/lib/ai-models.ts";

const VAPI_BASE = "https://api.vapi.ai";
const PATCH_DELAY_MS = 600;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type SyncResult = {
  agent: string;
  tel: string;
  status: "patched" | "skipped" | "failed";
  assistantId?: string;
  transcriber?: string;
  reason?: string;
};

async function vapiFetch(path: string, init?: RequestInit): Promise<any> {
  const key = process.env.VAPI_PRIVATE_KEY?.trim();
  if (!key) throw new Error("VAPI_PRIVATE_KEY not set");
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
    /* ignore */
  }
  if (!res.ok) {
    const msg = parsed?.message
      ? Array.isArray(parsed.message)
        ? parsed.message.join("; ")
        : parsed.message
      : body.slice(0, 300);
    throw new Error(`Vapi ${res.status}: ${msg}`);
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

async function syncOne(
  agent: ContactAgent,
  kind: "cs" | "demo",
  lookup: Map<string, { id: string; assistantId?: string | null }>,
): Promise<SyncResult> {
  const e164 = sanitizePhone(agent.tel) || agent.tel;
  const num = lookup.get(e164);
  if (!num) {
    return { agent: agent.name, tel: agent.tel, status: "skipped", reason: "no Vapi number" };
  }
  if (!num.assistantId) {
    return {
      agent: agent.name,
      tel: agent.tel,
      status: "skipped",
      reason: "number has no assistantId",
    };
  }

  try {
    const payload = buildShowcaseAssistantPayload(agent, kind, {
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
    });
    await patchAssistant(num.assistantId, payload);

    const numberPayload: Record<string, unknown> = {
      server: { url: SHOWCASE_WEBHOOK_URL },
    };
    if (process.env.VAPI_WEBHOOK_SECRET) {
      (numberPayload.server as any).secret = process.env.VAPI_WEBHOOK_SECRET;
    }
    await vapiFetch(`/phone-number/${num.id}`, {
      method: "PATCH",
      body: JSON.stringify(numberPayload),
    });

    return {
      agent: agent.name,
      tel: agent.tel,
      status: "patched",
      assistantId: num.assistantId,
      transcriber: (payload.transcriber as any)?.model,
    };
  } catch (e: any) {
    return {
      agent: agent.name,
      tel: agent.tel,
      status: "failed",
      assistantId: num.assistantId ?? undefined,
      reason: e?.message || String(e),
    };
  }
}

async function main() {
  const numbers = await vapiFetch("/phone-number?limit=100");
  const lookup = new Map<string, { id: string; assistantId?: string | null }>();
  for (const n of numbers) {
    if (n.number) lookup.set(n.number, { id: n.id, assistantId: n.assistantId });
  }

  const results: SyncResult[] = [];
  for (const a of WIRELINE_CONTACT_AGENTS) {
    results.push(await syncOne(a, "cs", lookup));
    await sleep(PATCH_DELAY_MS);
  }
  for (const a of WIRELINE_DEMO_AGENTS) {
    results.push(await syncOne(a, "demo", lookup));
    await sleep(PATCH_DELAY_MS);
  }

  const counts = { patched: 0, skipped: 0, failed: 0 };
  for (const r of results) {
    counts[r.status]++;
    const icon = r.status === "patched" ? "✓" : r.status === "skipped" ? "○" : "✗";
    const extra =
      r.status === "patched"
        ? ` → ${r.transcriber}`
        : r.reason
          ? ` (${r.reason})`
          : "";
    console.log(`  ${icon} ${r.agent} ${r.tel}${extra}`);
  }

  console.log("\nSummary:", counts);
  if (counts.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
