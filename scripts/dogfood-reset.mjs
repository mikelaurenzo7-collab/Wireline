#!/usr/bin/env node
/**
 * Reset dogfood session state on the demo account — clears Director thread +
 * demo-flagged channel data. Does NOT delete agents or re-seed the fleet.
 *
 * Usage: node scripts/dogfood-reset.mjs [--base https://trywireline.com]
 */
const base = (() => {
  const i = process.argv.indexOf("--base");
  return i >= 0 ? process.argv[i + 1] : process.env.APP_URL || "https://trywireline.com";
})();

const EMAIL = process.env.DOGFOOD_EMAIL || "wireline.demo@trywireline.com";
const PASSWORD = process.env.DOGFOOD_PASSWORD || "WirelineDemo!2026";

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
  if (!r.ok || !session) throw new Error(`Login failed ${r.status}`);
  return session.split(";")[0];
}

async function main() {
  const cookie = await login();
  const headers = { Cookie: cookie };

  const director = await fetch(`${base}/api/director/messages`, { method: "DELETE", headers });
  const directorData = await director.json().catch(() => ({}));
  if (!director.ok) {
    throw new Error(`Director clear failed ${director.status}: ${JSON.stringify(directorData)}`);
  }

  const demo = await fetch(`${base}/api/admin/demo-data`, { method: "DELETE", headers });
  const demoData = await demo.json().catch(() => ({}));
  if (!demo.ok) {
    throw new Error(`Demo data wipe failed ${demo.status}: ${JSON.stringify(demoData)}`);
  }

  console.log(`Dogfood reset @ ${base}`);
  console.log("  Director:", directorData);
  console.log("  Demo data:", demoData);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
