#!/usr/bin/env node
/** One-off key presence audit — metadata only unless decrypt=true for copy ops. */
const TEAM_ID = "team_ssX7cPECdHvXGFHSOuS9iXos";
const PROJECT_ID = "prj_mCjWa69TtFye8z11u8bSaWwO41f2";
const token = process.env.VERCEL_TOKEN?.trim();
const KEYS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "STRIPE_LIVE_VIDEO_ADDON_PRICE_ID",
      "LIVEAVATAR_API_KEY",
      "HEYGEN_API_KEY",
      "LIVEAVATAR_SANDBOX",
      "STRIPE_BUSINESS_STARTER_PRICE_ID",
      "UPSTASH_REDIS_REST_URL",
    ];

if (!token) {
  console.error("VERCEL_TOKEN required");
  process.exit(1);
}

const res = await fetch(
  `https://api.vercel.com/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const text = await res.text();
if (!res.ok) {
  console.error(`Vercel API ${res.status}: ${text.slice(0, 400)}`);
  process.exit(1);
}
const { envs = [] } = JSON.parse(text);
for (const key of KEYS) {
  const entries = envs.filter((e) => e.key === key);
  if (!entries.length) {
    console.log(`${key}: MISSING`);
    continue;
  }
  for (const e of entries) {
    console.log(`${key}: [${(e.target || []).join(",")}] type=${e.type}`);
  }
}
