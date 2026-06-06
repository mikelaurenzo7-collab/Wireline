#!/usr/bin/env node
/**
 * Inspect get_screen asset fields for a Stitch screen (requires API key locally).
 * Usage:
 *   GOOGLE_STITCH_API_KEY=... GOOGLE_STITCH_PROJECT_ID=8518455716666015580 \
 *     node scripts/probe-stitch-get-screen.mjs [screenId]
 */
import { Stitch, StitchToolClient } from "@google/stitch-sdk";

const apiKey = process.env.GOOGLE_STITCH_API_KEY?.trim() || process.env.STITCH_API_KEY?.trim();
const projectId =
  process.env.GOOGLE_STITCH_PROJECT_ID?.trim() || process.env.STITCH_PROJECT_ID?.trim();
const screenId = process.argv[2]?.trim();

if (!apiKey || !projectId || !screenId) {
  console.error("Need GOOGLE_STITCH_API_KEY, GOOGLE_STITCH_PROJECT_ID, and screenId arg");
  process.exit(1);
}

const client = new StitchToolClient({ apiKey, timeout: 120_000 });
const stitch = new Stitch(client);

function pickUrl(node) {
  if (!node || typeof node !== "object") return null;
  for (const key of ["downloadUrl", "uri", "url", "signedUrl"]) {
    const v = node[key];
    if (typeof v === "string" && v.startsWith("http")) return v;
  }
  for (const v of Object.values(node)) {
    const hit = pickUrl(v);
    if (hit) return hit;
  }
  return null;
}

try {
  const raw = await client.callTool("get_screen", {
    projectId,
    screenId,
    name: `projects/${projectId}/screens/${screenId}`,
  });
  const htmlUrl = pickUrl(raw?.htmlCode) || pickUrl(raw?.html);
  const imageUrl = pickUrl(raw?.screenshot) || pickUrl(raw?.image);
  console.log(JSON.stringify({ projectId, screenId, htmlUrl, imageUrl, keys: Object.keys(raw ?? {}) }, null, 2));
  if (htmlUrl) {
    const r = await fetch(htmlUrl);
    console.log(`html fetch: ${r.status} ${r.headers.get("content-type")} (${(await r.arrayBuffer()).byteLength} bytes)`);
  }
  if (imageUrl) {
    const r = await fetch(imageUrl);
    console.log(`image fetch: ${r.status} ${r.headers.get("content-type")} (${(await r.arrayBuffer()).byteLength} bytes)`);
  }
} finally {
  await client.close();
}
