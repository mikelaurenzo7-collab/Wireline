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
  appText9px: 0,
  appText10px: 5, // Raised to support PainterWorkspace micro labels
  marketingAuroraRingMax: 2, // Pricing tier spotlight + allowed marketing flourish
} as const;
