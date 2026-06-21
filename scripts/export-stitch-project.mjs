import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.STITCH_API_KEY;
const PROJECT_ID = process.env.STITCH_PROJECT_ID ?? "6981221452983374608";

if (!API_KEY) {
  console.error("Set STITCH_API_KEY before running export-stitch-project.mjs");
  process.exit(1);
}
const OUT_DIR = path.join(__dirname, "..", ".stitch-export");

async function mcpCall(name, args) {
  const res = await fetch("https://stitch.googleapis.com/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const json = await res.json();
  const text = json.result?.content?.[0]?.text;
  if (!text || json.result?.isError) {
    console.error("Error for", name, text || JSON.stringify(json.error || json, null, 2).slice(0, 500));
    return null;
  }
  return JSON.parse(text);
}

function safeFilename(title, screenId) {
  return (
    title
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || screenId
  );
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const project = await mcpCall("get_project", { name: `projects/${PROJECT_ID}` });
  if (!project) throw new Error("Could not load Stitch project");

  const screens = [];
  const instances = project.screenInstances || [];
  console.log(`Project: ${project.title} (${instances.length} screen instances)\n`);

  for (const inst of instances) {
    const screenId = inst.id;
    if (screenId.startsWith("assets_")) continue;

    const name = `projects/${PROJECT_ID}/screens/${screenId}`;
    process.stdout.write(`Fetching ${screenId}... `);
    const screen = await mcpCall("get_screen", { name, projectId: PROJECT_ID, screenId });
    if (!screen) {
      console.log("FAILED");
      continue;
    }

    const title = screen.title || screen.displayName || screenId;
    console.log(title);

    const entry = {
      id: screenId,
      title,
      width: screen.width || inst.width,
      height: screen.height || inst.height,
      hidden: inst.hidden ?? false,
      htmlUrl: screen.htmlCode?.downloadUrl || screen.htmlDownloadUrl || null,
      screenshotUrl: screen.screenshot?.downloadUrl || screen.screenshotDownloadUrl || null,
    };

    if (entry.htmlUrl) {
      const htmlRes = await fetch(entry.htmlUrl);
      const html = await htmlRes.text();
      const safeName = safeFilename(title, screenId);
      fs.writeFileSync(path.join(OUT_DIR, `${safeName}.html`), html);
      entry.htmlFile = `${safeName}.html`;
    }

    screens.push(entry);
    await new Promise((r) => setTimeout(r, 250));
  }

  if (project.designTheme?.designMd) {
    fs.writeFileSync(path.join(OUT_DIR, "DESIGN.md"), project.designTheme.designMd);
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(
      {
        projectId: PROJECT_ID,
        projectUrl: `https://stitch.withgoogle.com/projects/${PROJECT_ID}`,
        title: project.title,
        exportedAt: new Date().toISOString(),
        screens,
      },
      null,
      2,
    ),
  );

  console.log(`\nExported ${screens.length} screens to ${OUT_DIR}`);
}

main().catch(console.error);
