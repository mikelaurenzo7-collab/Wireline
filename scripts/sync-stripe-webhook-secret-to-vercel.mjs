#!/usr/bin/env node

/**
 * Store one rotated Stripe signing secret on canonical Vercel Production.
 * The helper never decrypts or prints secrets and never widens the target to
 * Preview/Development.
 */
import {
  PROJECT_ID,
  TEAM_ID,
  resolveVercelToken,
  vercelAuthHeaders,
} from "./lib/vercel-project.mjs";

const token = resolveVercelToken();
const secret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
if (!token) throw new Error("VERCEL_TOKEN is required.");
if (!/^whsec_[A-Za-z0-9]+$/.test(secret)) {
  throw new Error("STRIPE_WEBHOOK_SECRET must be a Stripe whsec_ signing secret.");
}

function url(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `https://api.vercel.com${path}${separator}teamId=${encodeURIComponent(TEAM_ID)}`;
}

async function request(path, init = {}) {
  const response = await fetch(url(path), {
    ...init,
    headers: {
      ...vercelAuthHeaders(token),
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Vercel environment update failed with HTTP ${response.status}.`);
  }
  return body;
}

async function listEntries() {
  const result = await request(`/v10/projects/${encodeURIComponent(PROJECT_ID)}/env`);
  return Array.isArray(result.envs) ? result.envs : [];
}

const existing = (await listEntries()).filter(
  (entry) => entry.key === "STRIPE_WEBHOOK_SECRET" && entry.target?.includes("production"),
);
if (existing.length > 1) {
  throw new Error("Multiple Production STRIPE_WEBHOOK_SECRET entries overlap; refusing ambiguity.");
}

if (existing.length === 1) {
  await request(
    `/v9/projects/${encodeURIComponent(PROJECT_ID)}/env/${encodeURIComponent(existing[0].id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ value: secret, target: ["production"] }),
    },
  );
} else {
  await request(`/v10/projects/${encodeURIComponent(PROJECT_ID)}/env`, {
    method: "POST",
    body: JSON.stringify({
      key: "STRIPE_WEBHOOK_SECRET",
      value: secret,
      type: "sensitive",
      target: ["production"],
    }),
  });
}

const verified = (await listEntries()).filter(
  (entry) => entry.key === "STRIPE_WEBHOOK_SECRET" && entry.target?.includes("production"),
);
const verifiedTargets = Array.isArray(verified[0]?.target) ? verified[0].target : [];
if (
  verified.length !== 1 ||
  verifiedTargets.length !== 1 ||
  verifiedTargets.some((target) => target !== "production") ||
  !["encrypted", "sensitive"].includes(verified[0].type)
) {
  throw new Error("Stripe webhook secret scope/type verification failed after update.");
}

console.log("STRIPE_WEBHOOK_SECRET updated as a protected Production-only Vercel value.");
