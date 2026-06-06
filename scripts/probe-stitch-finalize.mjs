#!/usr/bin/env node
/** Probe prod Stitch finalize for a known screen after dogfood. */
const base = process.env.APP_URL || "https://trywireline.com";
const EMAIL = process.env.DOGFOOD_EMAIL || "wireline.demo@trywireline.com";
const PASSWORD = process.env.DOGFOOD_PASSWORD || "WirelineDemo!2026";
const projectId = process.argv[2] || "8518455716666015580";
const screenId = process.argv[3] || "a14d48189bf148cf8757976d1c51ad23";
const prompt =
  process.argv[4] ||
  "Design a sleek mobile landing page for Laurenzo Cleaning Company — hero, services, testimonials, book-now CTA. Warm trustworthy palette.";

async function login() {
  const r = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: "manual",
  });
  const cookies = r.headers.getSetCookie?.() ?? [];
  const session = cookies.find((c) => c.startsWith("wireline_session="));
  if (!r.ok || !session) throw new Error(`login failed ${r.status}`);
  return session.split(";")[0];
}

async function main() {
  const cookie = await login();
  console.log(`Probing finalize @ ${base}`);
  console.log(`  project=${projectId} screen=${screenId}`);

  const t0 = Date.now();
  const r = await fetch(`${base}/api/director/stitch/finalize`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, screenId, operatorMessage: prompt, deviceType: "MOBILE" }),
  });
  const text = await r.text();
  console.log(`  status=${r.status} elapsed=${Math.round((Date.now() - t0) / 1000)}s`);
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2).slice(0, 4000));
  } catch {
    console.log(text.slice(0, 2000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
