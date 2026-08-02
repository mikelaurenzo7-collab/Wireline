#!/usr/bin/env node
/** Poll a Vercel deployment until READY or ERROR. */
import { TEAM_ID } from "./lib/vercel-project.mjs";
const id = process.argv[2];
const token = process.env.VERCEL_TOKEN?.trim();
if (!token || !id) {
  console.error("Usage: VERCEL_TOKEN=... node scripts/wait-vercel-deployment.mjs <deploymentId>");
  process.exit(1);
}

for (let i = 0; i < 36; i++) {
  const res = await fetch(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(id)}?teamId=${TEAM_ID}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const d = await res.json();
  const state = d.readyState || d.state;
  console.log(new Date().toISOString(), state);
  if (state === "READY") {
    console.log(JSON.stringify({ id, url: d.url, alias: d.alias }, null, 2));
    process.exit(0);
  }
  if (state === "ERROR" || state === "CANCELED") {
    console.error(JSON.stringify(d, null, 2));
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 10000));
}
console.error("Timed out waiting for deployment");
process.exit(2);
