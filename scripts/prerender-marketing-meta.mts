/**
 * Prerender per-route head metadata for the marketing SPA.
 *
 * Runs immediately after `vite build` (wired into the package `build` script,
 * which both local builds and `scripts/vercel-build.mjs` execute). For each
 * route in PRERENDERED_MARKETING_ROUTES it writes `dist/<route>/index.html`
 * — a copy of the built shell with that route's title/description/canonical/
 * OG/Twitter tags injected — so non-JS link crawlers unfurl the right card.
 *
 * Vercel serves filesystem matches before applying the SPA rewrite, so these
 * files take precedence for their routes; anywhere they are absent the
 * rewrite still serves the generic shell (fail-open to the status quo).
 *
 * Fails the build loudly if the shell's homepage defaults drift so injection
 * would silently no-op — the contract test pins the same invariant.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  HOME_TITLE,
  PRERENDERED_MARKETING_ROUTES,
  injectMarketingMeta,
  resolveRouteMeta,
} from "../src/lib/marketing-route-meta";

const dist = path.join(process.cwd(), "dist");
const shellPath = path.join(dist, "index.html");

let shell: string;
try {
  shell = readFileSync(shellPath, "utf8");
} catch {
  console.error(`prerender-marketing-meta: ${shellPath} not found — run vite build first.`);
  process.exit(1);
}

if (!shell.includes(`<title>${HOME_TITLE}</title>`)) {
  console.error(
    "prerender-marketing-meta: dist/index.html no longer carries the expected homepage <title>. " +
      "Update HOME_TITLE/HOME_DESCRIPTION in src/lib/marketing-route-meta.ts to match index.html.",
  );
  process.exit(1);
}

let written = 0;
for (const route of PRERENDERED_MARKETING_ROUTES) {
  const meta = resolveRouteMeta(route);
  if (!meta) {
    console.error(`prerender-marketing-meta: no meta resolved for ${route} — route map drifted.`);
    process.exit(1);
  }
  const html = injectMarketingMeta(shell, meta);
  if (html === shell) {
    console.error(`prerender-marketing-meta: injection was a no-op for ${route}.`);
    process.exit(1);
  }
  const outDir = path.join(dist, ...route.split("/").filter(Boolean));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "index.html"), html);
  written += 1;
}

console.log(`prerender-marketing-meta: wrote ${written} route shells under dist/.`);
