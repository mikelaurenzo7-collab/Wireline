#!/usr/bin/env node
/** Clear Director thread + artifacts for the demo account. */
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
  const r = await fetch(`${base}/api/director/messages`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Clear failed ${r.status}: ${JSON.stringify(data)}`);
  console.log(`Cleared demo Director thread @ ${base}`, data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
