#!/usr/bin/env node
/**
 * Audit Vapi phone numbers vs contact-agents catalog.
 * Usage: VAPI_PRIVATE_KEY=… node scripts/audit-vapi-showcase.mjs
 */
import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
} from "../src/data/contact-agents.ts";

const VAPI_BASE = "https://api.vapi.ai";
const key = process.env.VAPI_PRIVATE_KEY?.trim();
if (!key) {
  console.error("Set VAPI_PRIVATE_KEY");
  process.exit(1);
}

async function vapiFetch(path) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const expected = [
  ...WIRELINE_CONTACT_AGENTS.map((a) => ({ ...a, kind: "cs" })),
  ...WIRELINE_DEMO_AGENTS.map((a) => ({ ...a, kind: "demo" })),
];

const numbers = await vapiFetch("/phone-number?limit=100");
const assistants = await vapiFetch("/assistant?limit=100");
const byId = new Map(assistants.map((a) => [a.id, a]));

console.log("=== Expected catalog (9 lines) ===");
for (const e of expected) {
  console.log(`${e.name.padEnd(8)} ${e.tel}  voice=${e.voiceId?.slice(0, 8) ?? "—"}`);
}

console.log("\n=== Live Vapi numbers ===");
const numByTel = new Map(numbers.map((n) => [n.number, n]));
for (const e of expected) {
  const n = numByTel.get(e.tel);
  if (!n) {
    console.log(`✗ ${e.name} ${e.tel} — NUMBER NOT IN VAPI`);
    continue;
  }
  const a = n.assistantId ? byId.get(n.assistantId) : null;
  const nameOk = a?.name?.toLowerCase().includes(e.name.toLowerCase());
  const flux = a?.transcriber?.model === "flux-general-en";
  const voiceOk = !e.voiceId || a?.voice?.voiceId === e.voiceId;
  const fm = (a?.firstMessage || "").slice(0, 60);
  const voiceLive = a?.voice?.voiceId?.slice(0, 8) || "?";
  const voiceMsg = voiceOk ? "yes" : `NO (live ${voiceLive})`;
  console.log(
    `${nameOk ? "✓" : "⚠"} ${e.name} → assistant "${a?.name || "?"}" | flux=${flux ? "yes" : "NO"} | voiceMatch=${voiceMsg} | fm: ${fm}…`,
  );
}

console.log("\n=== Orphan Vapi numbers (not in catalog) ===");
const expectedTels = new Set(expected.map((e) => e.tel));
for (const n of numbers) {
  if (!expectedTels.has(n.number)) {
    const a = n.assistantId ? byId.get(n.assistantId) : null;
    console.log(`  ${n.number} → "${a?.name || "no assistant"}"`);
  }
}

console.log("\n=== Orphan assistants (no number in catalog) ===");
const usedAssistantIds = new Set(numbers.filter((n) => expectedTels.has(n.number)).map((n) => n.assistantId));
for (const a of assistants) {
  if (!usedAssistantIds.has(a.id)) {
    const linked = numbers.find((n) => n.assistantId === a.id);
    console.log(`  "${a.name}" id=${a.id.slice(0, 8)}… number=${linked?.number || "unlinked"}`);
  }
}
