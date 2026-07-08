#!/usr/bin/env node
/**
 * Redeploy latest READY main deployment so production picks up fresh env vars.
 * Usage: VERCEL_TOKEN=... node scripts/redeploy-vercel-production.mjs
 */
const TEAM_ID = "team_ssX7cPECdHvXGFHSOuS9iXos";
const PROJECT_ID = "prj_mCjWa69TtFye8z11u8bSaWwO41f2";

const token = process.env.VERCEL_TOKEN?.trim();
if (!token) {
  console.error("Set VERCEL_TOKEN");
  process.exit(1);
}

function vercelUrl(path) {
  const sep = path.includes("?") ? "&" : "?";
  return `https://api.vercel.com${path}${sep}teamId=${encodeURIComponent(TEAM_ID)}`;
}

async function vercelFetch(path, opts = {}) {
  const res = await fetch(vercelUrl(path), {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${text.slice(0, 800)}`);
  return body;
}

async function latestMainDeploymentId() {
  const data = await vercelFetch(
    `/v6/deployments?projectId=${encodeURIComponent(PROJECT_ID)}&limit=30`,
    { method: "GET" },
  );
  for (const d of data.deployments || []) {
    const ref = d.meta?.githubCommitRef;
    const state = d.state || d.readyState;
    const id = d.uid || d.id;
    if (ref === "main" && state === "READY" && id) return id;
  }
  throw new Error("No READY deployment from main found");
}

async function main() {
  const sourceId = await latestMainDeploymentId();
  console.log("Redeploying from source deployment:", sourceId);

  const result = await vercelFetch("/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: "wireline",
      project: PROJECT_ID,
      target: "production",
      deploymentId: sourceId,
    }),
  });

  const id = result.id || result.uid;
  console.log("New production deployment:", id);
  console.log("URL:", result.url || result.alias?.[0] || "(pending)");
  console.log("Inspect: https://vercel.com/revaluate/wireline/deployments");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
