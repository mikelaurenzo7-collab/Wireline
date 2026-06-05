#!/usr/bin/env node
/**
 * Director dogfood — login, send capability probes, assert routing + response shape.
 * Usage: node scripts/dogfood-director.mjs [--base https://trywireline.com]
 *
 * Website probes use the SSE stream (same as the product UI) to avoid platform
 * timeouts on long non-streaming POST bodies.
 */
const base = (() => {
  const i = process.argv.indexOf("--base");
  return i >= 0 ? process.argv[i + 1] : process.env.APP_URL || "http://localhost:3000";
})();

const EMAIL = process.env.DOGFOOD_EMAIL || "wireline.demo@trywireline.com";
const PASSWORD = process.env.DOGFOOD_PASSWORD || "WirelineDemo!2026";

const PROBES = [
  {
    id: "code",
    message: "Write a short TypeScript function that validates US phone numbers with Zod.",
    expect: (d) => typeof d.reply === "string" && d.reply.length > 80,
    note: "code in reply",
    mode: "post",
  },
  {
    id: "website",
    message:
      "Design a one-page website for a local HVAC company — include sitemap and a small HTML prototype.",
    expect: (d) =>
      typeof d.reply === "string" &&
      (d.reply.includes("```html") || d.reply.toLowerCase().includes("sitemap")),
    note: "website deliverable (stream)",
    mode: "stream",
  },
  {
    id: "not-logo",
    message: "Design a new website for my plumbing business with booking CTA.",
    expect: (d) => !Array.isArray(d.approvals) || d.approvals.length === 0,
    note: "no logo approval hijack (stream)",
    mode: "stream",
  },
];

async function login() {
  const r = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: "manual",
  });
  const setCookie = r.headers.getSetCookie?.() ?? [];
  const legacy = r.headers.get("set-cookie");
  const cookies = setCookie.length ? setCookie : legacy ? [legacy] : [];
  const session = cookies.find((c) => c.startsWith("wireline_session="));
  if (!r.ok || !session) {
    const body = await r.text();
    throw new Error(`Login failed ${r.status}: ${body.slice(0, 200)}`);
  }
  return session.split(";")[0];
}

function parseSseBuffer(buffer) {
  let done = null;
  const lines = buffer.split("\n");
  let event = "";
  for (const line of lines) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ") && event) {
      try {
        const data = JSON.parse(line.slice(6));
        if (event === "done") done = data;
      } catch {
        /* ignore */
      }
      event = "";
    } else if (line === "") event = "";
  }
  return done;
}

async function sendDirectorPost(cookie, content) {
  const r = await fetch(`${base}/api/director/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      content,
      modelSelection: { provider: "wireline", tier: "sonnet" },
    }),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON ${r.status}: ${text.slice(0, 300)}`);
  }
  if (!r.ok) throw new Error(`Director ${r.status}: ${data.error || text.slice(0, 200)}`);
  return data;
}

async function sendDirectorStream(cookie, content) {
  const r = await fetch(`${base}/api/director/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      content,
      modelSelection: { provider: "wireline", tier: "sonnet" },
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Director stream ${r.status}: ${text.slice(0, 200)}`);
  }
  const reader = r.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    if (parsed) return parsed;
  }
  const parsed = parseSseBuffer(buffer);
  if (parsed) return parsed;
  throw new Error("Stream ended without done event");
}

async function sendDirector(cookie, content, mode) {
  return mode === "stream"
    ? sendDirectorStream(cookie, content)
    : sendDirectorPost(cookie, content);
}

async function main() {
  console.log(`Director dogfood @ ${base}`);
  const cookie = await login();
  console.log("Logged in");

  let passed = 0;
  let failed = 0;

  for (const probe of PROBES) {
    process.stdout.write(`  [${probe.id}] ${probe.note}… `);
    try {
      const data = await sendDirector(cookie, probe.message, probe.mode);
      if (!probe.expect(data)) {
        console.log("FAIL (assertion)");
        failed++;
        continue;
      }
      const artifact = data.deliverableArtifact;
      const extra =
        artifact?.name ? ` · artifact ${artifact.name}` : data.model ? ` · ${data.model}` : "";
      console.log(`OK (${data.reply?.length ?? 0} chars${extra})`);
      passed++;
    } catch (e) {
      console.log(`FAIL (${e.message})`);
      failed++;
    }
  }

  console.log(`\n${passed}/${PROBES.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
