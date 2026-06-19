#!/usr/bin/env node
/**
 * Reset dogfood session state — clears Director thread and demo-flagged channel
 * data. Does not delete agents or re-seed the fleet.
 *
 * Usage: DOGFOOD_EMAIL=... DOGFOOD_PASSWORD=... node scripts/dogfood-reset.mjs
 */
import { requireDogfoodCredentials } from "./dogfood-credentials.mjs";

const base = (() => {
  const i = process.argv.indexOf("--base");
  return i >= 0 ? process.argv[i + 1] : process.env.APP_URL || "https://trywireline.com";
})();

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

  const [director, demo] = await Promise.all([
    fetch(`${base}/api/director/messages`, { method: "DELETE", headers }),
    fetch(`${base}/api/admin/demo-data`, { method: "DELETE", headers }),
  ]);

  const directorData = await director.json().catch(() => ({}));
  const demoData = await demo.json().catch(() => ({}));
  if (!director.ok) throw new Error(`Director clear failed ${director.status}: ${JSON.stringify(directorData)}`);
  if (!demo.ok) throw new Error(`Demo data wipe failed ${demo.status}: ${JSON.stringify(demoData)}`);

  console.log(`Dogfood reset @ ${base}`);
  console.log("  Director:", directorData);
  console.log("  Demo data:", demoData);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
