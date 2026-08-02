#!/usr/bin/env node
/**
 * Reset dogfood session state — clears Director thread and demo-flagged channel
 * data. Does not delete agents or re-seed the fleet.
 *
 * Usage:
 *   DOGFOOD_EMAIL=... DOGFOOD_PASSWORD=... node scripts/dogfood-reset.mjs
 *   DOGFOOD_EMAIL=... DOGFOOD_PASSWORD=... DEMO_EMAIL=... node scripts/dogfood-reset.mjs --dry-run
 *
 * DOGFOOD_EMAIL must be a platform admin. DEMO_EMAIL defaults to the
 * production showcase tenant.
 */
import { requireDogfoodCredentials } from "./dogfood-credentials.mjs";

const base = (() => {
  const i = process.argv.indexOf("--base");
  return i >= 0 ? process.argv[i + 1] : process.env.APP_URL || "https://trywireline.com";
})();
const dryRunOnly = process.argv.includes("--dry-run");
const demoEmail = (process.env.DEMO_EMAIL || "wireline.demo@trywireline.com").trim().toLowerCase();

const { email, password } = requireDogfoodCredentials();

async function login() {
  const response = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const legacyCookie = response.headers.get("set-cookie");
  const cookies = setCookie.length ? setCookie : legacyCookie ? [legacyCookie] : [];
  const session = cookies.find((cookie) => cookie.startsWith("wireline_session="));
  if (!response.ok || !session) throw new Error(`Login failed ${response.status}`);
  return session.split(";")[0];
}

async function main() {
  const cookie = await login();
  const headers = { Cookie: cookie };

  const demoQuery = `email=${encodeURIComponent(demoEmail)}`;
  const demoDryRun = await fetch(`${base}/api/admin/demo-data?dry_run=true&${demoQuery}`, {
    method: "DELETE",
    headers,
  });
  const demoDryRunData = await demoDryRun.json().catch(() => ({}));
  if (!demoDryRun.ok) {
    throw new Error(`Demo dry run failed ${demoDryRun.status}: ${JSON.stringify(demoDryRunData)}`);
  }
  if (dryRunOnly) {
    console.log(`Dogfood reset dry run @ ${base}`);
    console.log("  Demo data:", demoDryRunData);
    return;
  }

  const [director, demo] = await Promise.all([
    fetch(`${base}/api/director/messages`, { method: "DELETE", headers }),
    fetch(`${base}/api/admin/demo-data?dry_run=false&${demoQuery}`, { method: "DELETE", headers }),
  ]);

  const directorData = await director.json().catch(() => ({}));
  const demoData = await demo.json().catch(() => ({}));
  if (!director.ok)
    throw new Error(`Director clear failed ${director.status}: ${JSON.stringify(directorData)}`);
  if (!demo.ok)
    throw new Error(`Demo data wipe failed ${demo.status}: ${JSON.stringify(demoData)}`);

  console.log(`Dogfood reset @ ${base}`);
  console.log("  Demo dry run:", demoDryRunData);
  console.log("  Director:", directorData);
  console.log("  Demo data:", demoData);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
