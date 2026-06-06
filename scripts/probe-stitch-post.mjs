#!/usr/bin/env node
/** Probe Stitch via non-streaming POST (same path as chat UI for website/mockup asks). */
const base = (() => {
  const i = process.argv.indexOf("--base");
  return i >= 0 ? process.argv[i + 1] : process.env.APP_URL || "https://trywireline.com";
})();
const msg =
  process.argv.find((a) => a.startsWith("--message="))?.slice("--message=".length) ||
  "Design a sleek mobile landing page hero for a coffee subscription brand";

const EMAIL = process.env.DOGFOOD_EMAIL || "wireline.demo@trywireline.com";
const PASSWORD = process.env.DOGFOOD_PASSWORD || "WirelineDemo!2026";

async function login() {
  const r = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: "manual",
  });
  const cookies = r.headers.getSetCookie?.() ?? [];
  const session = cookies.find((c) => c.startsWith("wireline_session="))?.split(";")[0];
  if (!r.ok || !session) throw new Error(`Login failed ${r.status}`);
  return session;
}

async function main() {
  console.log(`Stitch POST probe @ ${base}`);
  const cookie = await login();
  const t0 = Date.now();
  const r = await fetch(`${base}/api/director/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      content: msg,
      modelSelection: { provider: "wireline", tier: "sonnet" },
    }),
  });
  const data = await r.json().catch(() => ({}));
  const ms = Date.now() - t0;
  if (!r.ok) {
    console.error("FAIL", r.status, data);
    process.exit(1);
  }
  const previews = Array.isArray(data.previews) ? data.previews.length : 0;
  const stitch = data.modelLabel === "Google Stitch" || previews > 0;
  console.log(
    JSON.stringify({
      ok: true,
      ms,
      modelLabel: data.modelLabel,
      previews,
      stitch,
      replyStart: String(data.reply || "").slice(0, 100),
    }),
  );
  process.exit(stitch ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
