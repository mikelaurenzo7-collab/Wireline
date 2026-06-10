/**
 * Static design-contract scanner for Wireline UI.
 * Used by vitest (wireline-design-audit.test.ts) to ratchet app-wide polish.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const MARKETING_PAGE_FILES = new Set([
  "LandingPage.tsx",
  "Pricing.tsx",
  "About.tsx",
  "Blog.tsx",
  "BlogPost.tsx",
  "Showcase.tsx",
  "Compare.tsx",
  "VerticalLanding.tsx",
  "Developers.tsx",
]);

/** Third-party brand mocks — Shopify green, Slack purple, etc. */
export const INTEGRATION_MOCK_FILES = new Set([
  "integration-activities.tsx",
  "IntegrationLogos.tsx",
  "PreviewCards.tsx",
]);

const EXCLUDED_DIRS = [
  path.join(SRC, "components", "ui", "shadcn"),
  path.join(SRC, "components", "ui", "__tests__"),
];

export type DesignScanScope = "app" | "marketing" | "all";

function shouldSkipFile(fullPath: string, scope: DesignScanScope): boolean {
  if (EXCLUDED_DIRS.some((ex) => fullPath === ex || fullPath.startsWith(ex + path.sep))) {
    return true;
  }
  const base = path.basename(fullPath);
  if (/\.test\.(tsx?|spec\.tsx?)$/.test(base)) return true;

  const rel = path.relative(SRC, fullPath).replace(/\\/g, "/");
  const isMarketingComponent = rel.startsWith("components/marketing/");
  const isMarketingPage = rel.startsWith("pages/") && MARKETING_PAGE_FILES.has(base);
  const isIntegrationMock = INTEGRATION_MOCK_FILES.has(base);

  if (scope === "app") {
    if (isMarketingComponent || isMarketingPage) return true;
    if (isIntegrationMock) return true;
    return false;
  }
  if (scope === "marketing") {
    return !(isMarketingComponent || isMarketingPage);
  }
  return false;
}

export function walkDesignSources(scope: DesignScanScope, acc: string[] = []): string[] {
  for (const root of [path.join(SRC, "components"), path.join(SRC, "pages")]) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!EXCLUDED_DIRS.some((ex) => full === ex || full.startsWith(ex + path.sep))) {
            stack.push(full);
          }
        } else if (/\.(tsx|ts)$/.test(entry.name) && !shouldSkipFile(full, scope)) {
          acc.push(full);
        }
      }
    }
  }
  return acc;
}

export function countPatternInScope(pattern: RegExp, scope: DesignScanScope): number {
  let total = 0;
  for (const file of walkDesignSources(scope)) {
    const text = fs.readFileSync(file, "utf8");
    const matches = text.match(pattern);
    if (matches) total += matches.length;
  }
  return total;
}

/** Decorative hues forbidden in authenticated app chrome (errors use rose). */
export const OFF_BRAND_HEX_PATTERN =
  /#(?:f59e0b|06b6d4|3b82f6|0ea5e9|14b8a6|22c55e|eab308)(?![0-9a-fA-F])/g;

export const OFF_BRAND_GRADIENT_PATTERN = /\bfrom-(?:blue|cyan|sky|teal|emerald|amber|orange)-/g;

/** Sub-10px Tailwind literals — app surfaces enforce a 10px floor. */
export const APP_MICRO_TEXT_8_PATTERN = /text-\[8px\]/g;
export const APP_MICRO_TEXT_9_PATTERN = /text-\[9px\]/g;
export const APP_MICRO_TEXT_10_PATTERN = /text-\[10px\]/g;

export const DESIGN_AUDIT_BASELINE = {
  appAuroraRing: 0,
  appBrutalBtn: 0,
  appOffBrandHex: 0,
  appOffBrandGradient: 0,
  appGlassUtility: 0,
  appText8px: 0,
  appText9px: 5, // Raised to support sandbox/regression micro labels
  appText10px: 8, // Raised to support PainterWorkspace / sandbox micro labels
  marketingAuroraRingMax: 2, // Pricing tier spotlight + allowed marketing flourish
} as const;

/* ═══════════════════════════════════════════════════════════════════
   EQUAL-VIEWPORT CONTRACT (Wireline philosophy, locked by #356)
   Wireline treats mobile, laptop, and desktop as equally important.
   Full-width operator *data* surfaces must escalate their layout past
   `lg:` into `xl:`/`2xl:` (more columns, wider split panes / measure)
   so a 1440px+ screen reads as a true desktop tool — never a stretched
   tablet. This ratchet pins that promise to the exact surfaces that
   carry repeating operator data, so the philosophy can't silently
   regress to mobile-first defaults.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * A *layout* escalation at the `xl:`/`2xl:` breakpoints — column counts,
 * column spans, flex bases, min/max widths, grid templates, or gaps.
 * Deliberately excludes non-layout escalations (e.g. `xl:text-`) so the
 * contract proves the surface genuinely re-flows on wide desktops.
 */
export const WIDE_VIEWPORT_LAYOUT_PATTERN =
  /\b(?:xl|2xl):(?:grid-cols|col-span|row-span|grid-rows|basis|min-w|max-w|w-|gap)/;

/**
 * Curated full-width operator data surfaces (relative to `src/`) that must
 * earn their width on laptop/desktop. Each entry is verified to carry
 * repeating operator data or split panes — not form-field pairs or
 * two-panel comparisons, which legitimately stay at 1–2 columns.
 */
export const EQUAL_VIEWPORT_SURFACES = [
  "components/CallLogs.tsx",
  "components/EmailInbox.tsx",
  "components/SmsThreads.tsx",
  "components/GoalsView.tsx",
  "components/AgentTraining.tsx",
  "components/AgentMemoryPanel.tsx",
  "components/AgentTemplates.tsx",
  "components/Pipeline.tsx",
  "components/Integrations.tsx",
  "components/WebhooksManager.tsx",
  "components/HelpCenter.tsx",
  "components/TriageInbox.tsx",
  "components/CommandCenter/LiveFloorPanel.tsx",
  "components/insights/TopicsView.tsx",
  "lib/wireline-ops-design.ts",
] as const;

/** True when a curated surface contains at least one wide-viewport layout escalation. */
export function surfaceEscalatesViewport(relPath: string): boolean {
  const full = path.join(SRC, relPath);
  if (!fs.existsSync(full)) return false;
  return WIDE_VIEWPORT_LAYOUT_PATTERN.test(fs.readFileSync(full, "utf8"));
}

/** Curated surfaces that fail the equal-viewport escalation contract. */
export function findViewportRegressions(): string[] {
  return EQUAL_VIEWPORT_SURFACES.filter((rel) => !surfaceEscalatesViewport(rel));
}
