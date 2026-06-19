#!/usr/bin/env node
/**
 * Director contract smoke. This script intentionally requires explicit consent
 * because it invokes a paid model-backed endpoint.
 *
 * Usage:
 *   DOGFOOD_EMAIL=... DOGFOOD_PASSWORD=... DOGFOOD_ALLOW_DIRECTOR=1 npm run dogfood:director
 */
import { requireDogfoodCredentials } from "./dogfood-credentials.mjs";

const base = (() => {
  const index = process.argv.indexOf("--base");
  return index >= 0 ? process.argv[index + 1] : process.env.APP_URL || "http://localhost:3000";
})();

if (process.env.DOGFOOD_ALLOW_DIRECTOR !== "1") {
  throw new Error("Set DOGFOOD_ALLOW_DIRECTOR=1 to run a model-backed Director dogfood check.");
}

const { email, password } = requireDogfoodCredentials();

async function login() {
  const response = await fetch(`${base}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const fallback = response.headers.get("set-cookie");
  const cookies = setCookie.length ? setCookie : fallback ? [fallback] : [];
  const session = cookies.find((cookie) => cookie.startsWith("wireline_session="));
  if (!response.ok || !session) throw new Error(`Sign-in failed (${response.status})`);
  return session.split(";")[0];
}

async function main() {
  const cookie = await login();
  const response = await fetch(`${base}/api/director/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      content: "Confirm you are available and return a concise one-sentence response.",
      modelSelection: { provider: "wireline", tier: "sonnet" },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Director request failed (${response.status})`);
  if (!payload || typeof payload.reply !== "string" || payload.reply.trim().length < 8) {
    throw new Error("Director response did not contain a usable reply.");
  }

  console.log(JSON.stringify({ ok: true, base, model: payload.modelLabel || payload.model || "wireline" }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
