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
import { VAPI_OPENAI_FALLBACK_MODEL } from "../src/lib/claude-brain";
import {
  buildShowcaseAssistantPayload,
  buildShowcaseSystemPrompt,
} from "../src/lib/showcase-assistant";

const VAPI_KEY = process.env.VAPI_PRIVATE_KEY;
if (!VAPI_KEY) {
  console.error("Missing VAPI_PRIVATE_KEY env var.");
  process.exit(1);
}

function sanitize(tel: string): string {
  return "+" + String(tel).replace(/[^0-9]/g, "");
}

async function patchAssistantWithOpenAiFallback(
  assistantId: string,
  payload: Record<string, any>,
) {
  const patch = async (body: Record<string, any>) =>
    fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${VAPI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  let response = await patch(payload);
  if (!response.ok && payload?.model?.provider === "google") {
    const errorText = await response.text().catch(() => "");
    console.log(
      `  WARN fallback to GPT-4o for ${assistantId.slice(0, 8)} — ${errorText.slice(0, 120)}`,
    );

    const fallbackPayload = {
      ...payload,
      model: {
        ...payload.model,
        provider: "openai",
        model: VAPI_OPENAI_FALLBACK_MODEL,
      },
    };
    delete fallbackPayload.model.fallbackModels;
    response = await patch(fallbackPayload);
  }

  return response;
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

    const systemPrompt = buildShowcaseSystemPrompt(a, kind);
    if (systemPrompt.length > 30_000) {
      console.log(
        `  FAIL ${a.name.padEnd(8)} (${a.display}) — prompt ${systemPrompt.length}c exceeds 30k cap`,
      );
      failed++;
      continue;
    }
    const payload = buildShowcaseAssistantPayload(a, kind, {
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
    });

    const r = await patchAssistantWithOpenAiFallback(assistantId, payload);

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
