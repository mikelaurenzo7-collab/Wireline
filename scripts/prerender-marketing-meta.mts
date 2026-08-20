import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HOME_DESCRIPTION, HOME_TITLE, PRERENDERED_ROUTE_SHELLS, SITE_URL, escapeHtml, injectMarketingMeta, resolveRouteMeta } from "../src/lib/marketing-route-meta";
import { BOTBOUND_PRODUCTION_ORIGIN } from "../src/lib/brand";

const dist = path.join(process.cwd(), "dist");
const shellPath = path.join(dist, "index.html");
let shell: string;
try { shell = readFileSync(shellPath, "utf8"); } catch { console.error(`prerender-marketing-meta: ${shellPath} not found — run vite build first.`); process.exit(1); }

if (!shell.includes(`<title>${HOME_TITLE}</title>`)) {
  console.error("prerender-marketing-meta: dist/index.html no longer carries the expected BotBound homepage title.");
  process.exit(1);
}

// Public metadata has its own BotBound origin. APP_URL remains free to stay on
// a compatibility host until external OAuth/provider callback registrations
// are cut over. VITE_PUBLIC_SITE_URL is the only supported metadata override.
if (SITE_URL !== BOTBOUND_PRODUCTION_ORIGIN) {
  shell = shell.split(BOTBOUND_PRODUCTION_ORIGIN).join(SITE_URL);
}
writeFileSync(shellPath, shell);

let written = 0;
for (const route of PRERENDERED_ROUTE_SHELLS) {
  const meta = resolveRouteMeta(route);
  if (!meta) { console.error(`prerender-marketing-meta: no meta resolved for ${route}.`); process.exit(1); }
  const html = injectMarketingMeta(shell, meta);
  const required: Array<[string, string]> = [
    ["title", `<title>${escapeHtml(meta.title)}</title>`],
    ["canonical", `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`],
    ["og:url", `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`],
  ];
  if (meta.noIndex) required.push(["robots", '<meta name="robots" content="noindex, nofollow" />'], ["googlebot", '<meta name="googlebot" content="noindex, nofollow" />']);
  const missing = required.filter(([, expected]) => !html.includes(expected));
  if (missing.length) { console.error(`prerender-marketing-meta: injection incomplete for ${route}: ${missing.map(([name]) => name).join(", ")}`); process.exit(1); }
  const outDir = path.join(dist, ...route.split("/").filter(Boolean));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "index.html"), html);
  written += 1;
}
console.log(`prerender-marketing-meta: wrote ${written} BotBound route shells under dist/.`);
