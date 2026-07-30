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
  escapeHtml,
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
  // A whole-file inequality check only catches a *total* no-op. If the shell's
  // canonical or og:url tag drifted while the title still matched, the page
  // would ship with another route's canonical — the exact duplicate-content
  // problem this prerender exists to fix — and the build would stay green.
  // Assert every substitution the route depends on actually landed.
  // Compare against the same escaping injectMarketingMeta applies, so a title
  // containing `&` or a quote cannot fail this guard spuriously.
  const required: Array<[string, string]> = [
    ["title", `<title>${escapeHtml(meta.title)}</title>`],
    ["canonical", `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`],
    ["og:url", `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`],
  ];
  const missing = required.filter(([, expected]) => !html.includes(expected));
  if (html === shell || missing.length) {
    console.error(
      `prerender-marketing-meta: injection incomplete for ${route} — ${
        html === shell ? "no-op" : `missing ${missing.map(([name]) => name).join(", ")}`
      }. The static shell's head no longer matches what marketing-route-meta.ts replaces.`,
    );
    process.exit(1);
  }
  const outDir = path.join(dist, ...route.split("/").filter(Boolean));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "index.html"), html);
  written += 1;
}

console.log(`prerender-marketing-meta: wrote ${written} route shells under dist/.`);
