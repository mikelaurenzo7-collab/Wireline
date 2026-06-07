#!/usr/bin/env node
/**
 * Verify Stitch MCP via service-account OAuth (production path on Vercel).
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS_JSON='...' GOOGLE_CLOUD_PROJECT=wireline-app \
 *   GOOGLE_STITCH_PROJECT_ID=6427745350871153777 node scripts/verify-stitch-sa.mjs
 */
import { GoogleAuth } from "google-auth-library";

const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim() || "";
const cloudProject = process.env.GOOGLE_CLOUD_PROJECT?.trim() || "";
const stitchProjectId =
  process.env.GOOGLE_STITCH_PROJECT_ID?.trim() || process.env.STITCH_PROJECT_ID?.trim() || "";
const baseUrl = process.env.STITCH_HOST?.trim() || "https://stitch.googleapis.com/mcp";

if (!credsJson || !cloudProject) {
  console.error("Missing GOOGLE_APPLICATION_CREDENTIALS_JSON and/or GOOGLE_CLOUD_PROJECT");
  process.exit(1);
}

let credentials;
try {
  credentials = JSON.parse(credsJson);
} catch (e) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON:", e.message);
  process.exit(1);
}

async function getAccessToken() {
  const auth = new GoogleAuth({
    credentials,
    scopes: "https://www.googleapis.com/auth/cloud-platform",
    projectId: cloudProject,
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token?.token) throw new Error("No access token returned");
  return token.token;
}

async function mcpCall(accessToken, name, args) {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
      "X-Goog-User-Project": cloudProject,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  if (json.error) throw new Error(json.error.message || "MCP error");
  const result = json.result;
  if (result?.isError) {
    throw new Error(
      result.content?.map((c) => c.text).filter(Boolean).join("\n") || "tool error",
    );
  }
  if (result?.structuredContent !== undefined) return result.structuredContent;
  const block = result?.content?.find((c) => c.type === "text" && c.text)?.text;
  if (block) {
    try {
      return JSON.parse(block);
    } catch {
      return block;
    }
  }
  return result;
}

function extractProjects(payload) {
  const list = payload?.projects ?? payload;
  if (!Array.isArray(list)) return [];
  return list.map((p) => ({
    projectId: String(p.projectId ?? p.id ?? p.name ?? "")
      .replace(/^projects\//, "")
      .trim(),
    title: p.title ?? p.displayName ?? "(untitled)",
    projectType: p.projectType ?? p.type ?? "unknown",
  }));
}

async function main() {
  console.log(`Stitch SA verify @ ${baseUrl} (quota project ${cloudProject})`);
  const token = await getAccessToken();
  console.log("OK: OAuth access token issued");

  const projectsPayload = await mcpCall(token, "list_projects", {});
  const projects = extractProjects(projectsPayload);
  console.log(`list_projects: ${projects.length} project(s)`);
  for (const p of projects.slice(0, 10)) {
    console.log(`  ${p.projectId}  ${p.title}  [${p.projectType}]`);
  }

  if (!stitchProjectId) {
    console.log("\nSet GOOGLE_STITCH_PROJECT_ID to run list_screens.");
    process.exit(0);
  }

  const match = projects.find((p) => p.projectId === stitchProjectId);
  if (!match) {
    console.error(`\nFAIL: GOOGLE_STITCH_PROJECT_ID=${stitchProjectId} not in list_projects`);
    process.exit(1);
  }
  if (!/TEXT_TO_UI/i.test(match.projectType)) {
    console.error(`\nFAIL: project type ${match.projectType} — need TEXT_TO_UI at stitch.withgoogle.com`);
    process.exit(1);
  }

  const screens = await mcpCall(token, "list_screens", { projectId: stitchProjectId });
  const count = Array.isArray(screens?.screens) ? screens.screens.length : 0;
  console.log(`\nOK: project ${stitchProjectId} (${match.title}) — ${count} screen(s)`);
}

main().catch((e) => {
  console.error("FAIL:", e.message || e);
  process.exit(1);
});
