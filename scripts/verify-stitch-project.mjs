#!/usr/bin/env node
/**
 * Verify Stitch API key + project ID (TEXT_TO_UI type) for Wireline Director.
 *
 * Usage:
 *   GOOGLE_STITCH_API_KEY=... GOOGLE_STITCH_PROJECT_ID=8518455716666015580 node scripts/verify-stitch-project.mjs
 */
const apiKey =
  process.env.GOOGLE_STITCH_API_KEY?.trim() || process.env.STITCH_API_KEY?.trim() || "";
const projectId =
  process.env.GOOGLE_STITCH_PROJECT_ID?.trim() || process.env.STITCH_PROJECT_ID?.trim() || "";

if (!apiKey) {
  console.error("Missing GOOGLE_STITCH_API_KEY (or STITCH_API_KEY)");
  process.exit(1);
}

const baseUrl = process.env.STITCH_HOST?.trim() || "https://stitch.googleapis.com/mcp";

async function callTool(name, args) {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
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
    title: p.title ?? p.displayName ?? p.display_name ?? "(untitled)",
    projectType: p.projectType ?? p.type ?? p.project_type ?? "unknown",
  }));
}

async function main() {
  console.log(`Stitch MCP @ ${baseUrl}`);
  const projectsPayload = await callTool("list_projects", {});
  const projects = extractProjects(projectsPayload);
  console.log(`Found ${projects.length} project(s):`);
  for (const p of projects) {
    const marker =
      projectId && p.projectId === projectId
        ? " ← GOOGLE_STITCH_PROJECT_ID"
        : /TEXT_TO_UI/i.test(p.projectType)
          ? " (TEXT_TO_UI — supports generate)"
          : " (may NOT support generate)";
    console.log(`  ${p.projectId}  ${p.title}  [${p.projectType}]${marker}`);
  }

  if (projectId) {
    const match = projects.find((p) => p.projectId === projectId);
    if (!match) {
      console.error(`\nFAIL: GOOGLE_STITCH_PROJECT_ID=${projectId} not in list_projects`);
      process.exit(1);
    }
    if (!/TEXT_TO_UI/i.test(match.projectType)) {
      console.error(
        `\nFAIL: project ${projectId} is type ${match.projectType} — create a TEXT_TO_UI project at stitch.withgoogle.com`,
      );
      process.exit(1);
    }
    const screens = await callTool("list_screens", { projectId });
    const count = Array.isArray(screens?.screens) ? screens.screens.length : 0;
    console.log(`\nOK: project ${projectId} (${match.title}) — ${count} screen(s)`);
    process.exit(0);
  }

  const compatible = projects.filter((p) => /TEXT_TO_UI/i.test(p.projectType));
  if (compatible.length === 0) {
    console.error("\nNo TEXT_TO_UI projects — create one at stitch.withgoogle.com and set GOOGLE_STITCH_PROJECT_ID");
    process.exit(1);
  }
  console.log(`\nSet GOOGLE_STITCH_PROJECT_ID=${compatible[0].projectId} (recommended: ${compatible[0].title})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
