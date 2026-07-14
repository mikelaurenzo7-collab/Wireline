import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AUTHENTICATED_ROUTE_TEMPLATES,
  DEMO_AGENT_ROUTE_TOKEN,
  FULL_SCREENSHOT_COUNT,
  PUBLIC_ROUTES,
  VISUAL_QA_SCHEMA_VERSION,
  VISUAL_QA_VIEWPORTS,
  captureKey,
} from "../scripts/visual-qa-matrix.mjs";
import { validateVisualQaManifest } from "../scripts/visual-qa-manifest.mjs";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

function validCapture(mode: string, viewport: (typeof VISUAL_QA_VIEWPORTS)[number], route: string) {
  return {
    mode,
    viewport: viewport.name,
    routeTemplate: route,
    route: route.replace(DEMO_AGENT_ROUTE_TOKEN, "agent-qa"),
    finalUrl: `https://trywireline.com${route.replace(DEMO_AGENT_ROUTE_TOKEN, "agent-qa")}`,
    responseStatus: 200,
    file: `${mode}-${viewport.name}-${route}.png`,
    success: true,
    png: { width: viewport.width, height: viewport.height },
    diagnostics: {
      title: "Wireline QA",
      h1Count: 1,
      h1Text: ["Wireline QA"],
      duplicateIds: [],
      brokenImages: [],
      modalCount: mode === "authenticated" && route === "/studio?create=1" ? 1 : 0,
      modalLabels: [],
      busyCount: 0,
      busyLabels: [],
      bodyTextLength: 100,
      visibleSemanticElementCount: 10,
      pageOverflow: false,
      overflowElements: [],
      blank: false,
    },
  };
}

function validManifest() {
  const captures = VISUAL_QA_VIEWPORTS.flatMap((viewport) => [
    ...PUBLIC_ROUTES.map((route) => validCapture("public", viewport, route)),
    ...AUTHENTICATED_ROUTE_TEMPLATES.map((route) => validCapture("authenticated", viewport, route)),
  ]);
  return {
    schemaVersion: VISUAL_QA_SCHEMA_VERSION,
    focus: "full",
    captureMode: "settled-viewport",
    fullPageEvidence: false,
    captureComplete: true,
    authenticatedCapture: true,
    demoAgentId: "agent-qa",
    viewports: VISUAL_QA_VIEWPORTS.map(({ name, width, height }) => ({ name, width, height })),
    publicRoutes: [...PUBLIC_ROUTES],
    authenticatedRouteTemplates: [...AUTHENTICATED_ROUTE_TEMPLATES],
    authenticatedRoutes: AUTHENTICATED_ROUTE_TEMPLATES.map((route) =>
      route.replace(DEMO_AGENT_ROUTE_TOKEN, "agent-qa"),
    ),
    screenshotCountExpected: FULL_SCREENSHOT_COUNT,
    screenshotCountActual: FULL_SCREENSHOT_COUNT,
    captures,
    issues: [],
  };
}

describe("production visual QA harness", () => {
  it("locks the complete route and responsive-boundary matrix", () => {
    expect(PUBLIC_ROUTES).toHaveLength(39);
    expect(AUTHENTICATED_ROUTE_TEMPLATES).toHaveLength(24);
    expect(VISUAL_QA_VIEWPORTS).toHaveLength(15);
    expect(FULL_SCREENSHOT_COUNT).toBe(945);
    expect(AUTHENTICATED_ROUTE_TEMPLATES).toContain(`/studio?agent=${DEMO_AGENT_ROUTE_TOKEN}`);
    expect(VISUAL_QA_VIEWPORTS.map(({ width }) => width)).toEqual([
      360, 390, 430, 639, 640, 767, 768, 834, 1023, 1024, 1280, 1365, 1440, 1536, 1920,
    ]);
  });

  it("uses settled viewport screenshots and current signup/Fast Start selectors", () => {
    const capture = read("scripts/capture-prod-visual-qa.mjs");
    expect(capture).toContain('WIRELINE_QA_FOCUS || "full"');
    expect(capture).toContain('locator("#auth-email")');
    expect(capture).toContain("locator('form input[type=\"checkbox\"]')");
    expect(capture).toContain('getByRole("dialog", { name: /Fast Start/i })');
    expect(capture).toContain("/(?:AI employee|Agent) name/i");
    expect(capture).toContain("/^Create (?:AI employee|agent)$/i");
    expect(capture).toContain("click({ noWaitAfter: true })");
    expect(capture).toContain('current.pathname === "/studio"');
    expect(capture).toContain('failure?.errorText?.includes("ERR_ABORTED")');
    expect(capture).toContain("fullPage: false");
    expect(capture).not.toContain("fullPage: true");
  });

  it("rejects public-only, incomplete, and unexplained manifests", () => {
    const manifest = validManifest();
    expect(validateVisualQaManifest(manifest, { checkFiles: false })).toEqual([]);

    const publicOnly = { ...manifest, authenticatedCapture: false };
    expect(validateVisualQaManifest(publicOnly, { checkFiles: false })).toContain(
      "authenticatedCapture must be true; public-only evidence cannot pass launch QA.",
    );

    const incomplete = {
      ...manifest,
      captureComplete: false,
      screenshotCountActual: FULL_SCREENSHOT_COUNT - 1,
      captures: manifest.captures.slice(0, -1),
    };
    expect(validateVisualQaManifest(incomplete, { checkFiles: false }).length).toBeGreaterThan(0);

    const unexplained = {
      ...manifest,
      issues: [
        {
          kind: "overflow",
          mode: "public",
          viewport: "compact-360x640",
          route: "/",
          detail: "Document exceeds viewport.",
        },
      ],
    };
    expect(validateVisualQaManifest(unexplained, { checkFiles: false })).toContain(
      "[overflow] public compact-360x640 /: Document exceeds viewport.",
    );
  });

  it("keeps every matrix key unique", () => {
    const keys = VISUAL_QA_VIEWPORTS.flatMap((viewport) => [
      ...PUBLIC_ROUTES.map((route) => captureKey("public", viewport.name, route)),
      ...AUTHENTICATED_ROUTE_TEMPLATES.map((route) =>
        captureKey("authenticated", viewport.name, route),
      ),
    ]);
    expect(new Set(keys).size).toBe(FULL_SCREENSHOT_COUNT);
  });
});
