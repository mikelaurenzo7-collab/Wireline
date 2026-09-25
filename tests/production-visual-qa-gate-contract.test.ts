import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCTION_VISUAL_BASE_URL,
  optionalProductionVisualArtifactNames,
  productionVisualRouteExpectation,
  productionVisualSemanticKey,
  PRODUCTION_VISUAL_AUTHENTICATED_ROUTES,
  PRODUCTION_VISUAL_COMPATIBILITY_ROUTES,
  PRODUCTION_VISUAL_MANIFEST_VIEWPORTS,
  PRODUCTION_VISUAL_MARKETING_ROUTES,
  requiredProductionVisualArtifactNames,
  requiredProductionVisualSemanticAssertions,
  routeReachedExactly,
} from "../scripts/lib/production-visual-qa-contract.mjs";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const SHA = "a".repeat(40);
const ARTIFACT_DIRECTORY = "2026-08-26T12-00-00-000Z";
const VISUAL_GATE_CHILD_TIMEOUT_MS = 60_000;
const VISUAL_GATE_TIMEOUT_MARGIN_MS = 30_000;
const visualGateTestTimeout = (invocations: number) =>
  invocations * VISUAL_GATE_CHILD_TIMEOUT_MS + VISUAL_GATE_TIMEOUT_MARGIN_MS;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZegAAAABJRU5ErkJggg==",
  "base64",
);

type Manifest = Record<string, any>;

function invokeGate(manifestPath: string, production = true) {
  const result = spawnSync(
    process.execPath,
    [
      resolve(process.cwd(), "scripts/check-visual-qa-manifest.mjs"),
      ...(production ? ["--production"] : []),
      manifestPath,
    ],
    { encoding: "utf8", timeout: VISUAL_GATE_CHILD_TIMEOUT_MS },
  );
  if (result.error) throw result.error;
  return result;
}

function withFixture(
  callback: (fixture: {
    artifactPath: string;
    manifest: Manifest;
    manifestPath: string;
    run: (manifest?: Manifest) => ReturnType<typeof invokeGate>;
  }) => void,
  { includeOptionalScrollEnd = false } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "botbound-visual-gate-"));
  const artifactPath = join(directory, ARTIFACT_DIRECTORY);
  const manifestPath = join(directory, "latest-manifest.json");
  mkdirSync(artifactPath);
  const requiredNames = requiredProductionVisualArtifactNames();
  const names = [...requiredNames];
  if (includeOptionalScrollEnd) names.push(optionalProductionVisualArtifactNames()[0]);
  names.sort((left, right) => left.localeCompare(right));
  const sha256 = createHash("sha256").update(PNG).digest("hex");
  for (const file of names) writeFileSync(join(artifactPath, file), PNG);

  const proof = {
    baseURL: CANONICAL_PRODUCTION_VISUAL_BASE_URL,
    deployedCommit: SHA,
    verifiedAt: new Date(0).toISOString(),
  };
  const manifest: Manifest = {
    baseUrl: CANONICAL_PRODUCTION_VISUAL_BASE_URL,
    artifactDirectory: ARTIFACT_DIRECTORY,
    sourceCommit: SHA,
    expectedCommit: SHA,
    sourceVerifiedAt: proof.verifiedAt,
    sourceProofBefore: proof,
    sourceProofAfter: proof,
    qaAccountConfigured: true,
    authenticatedCapture: true,
    viewports: PRODUCTION_VISUAL_MANIFEST_VIEWPORTS.map((viewport) => ({ ...viewport })),
    marketingRoutes: [...PRODUCTION_VISUAL_MARKETING_ROUTES],
    authenticatedRoutes: [...PRODUCTION_VISUAL_AUTHENTICATED_ROUTES],
    compatibilityRoutes: [...PRODUCTION_VISUAL_COMPATIBILITY_ROUTES],
    screenshotCountExpected: requiredNames.length,
    screenshotCountActual: names.length,
    artifacts: names.map((file) => ({ file, bytes: PNG.byteLength, sha256 })),
    semanticAssertions: requiredProductionVisualSemanticAssertions(),
    issues: [],
  };

  const run = (candidate = manifest) => {
    writeFileSync(manifestPath, JSON.stringify(candidate));
    return invokeGate(manifestPath);
  };

  try {
    callback({ artifactPath, manifest, manifestPath, run });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("production visual QA safety gate", () => {
  const capture = read("scripts/capture-prod-visual-qa.mjs");
  const gate = read("scripts/check-visual-qa-manifest.mjs");
  const workflow = read(".github/workflows/production-visual-qa.yml");

  it("treats only semantic aliases as intentional duplicate captures", () => {
    expect(productionVisualSemanticKey("authenticated", "/overview")).toBe(
      productionVisualSemanticKey("authenticated", "/studio"),
    );
    expect(productionVisualSemanticKey("authenticated", "/apps")).toBe(
      productionVisualSemanticKey("authenticated", "/settings/apps"),
    );
    expect(productionVisualSemanticKey("public", "/features")).not.toBe(
      productionVisualSemanticKey("public", "/pricing"),
    );
    expect(productionVisualSemanticKey("public", "/get-started")).toBe(
      productionVisualSemanticKey("public", "/signup"),
    );
    expect(productionVisualSemanticKey("public", "/signin")).not.toBe(
      productionVisualSemanticKey("public", "/signup"),
    );
    // Aliased pixels still require proof that each requested route mounted.
    expect(productionVisualRouteExpectation("public", "/get-started")?.states).toEqual([
      "get-started",
    ]);
    expect(productionVisualRouteExpectation("public", "/signup")?.states).toEqual(["signup"]);
  });

  it("budgets the workflow beyond source wait plus a conservative capture allowance", () => {
    const jobTimeoutMinutes = Number(workflow.match(/timeout-minutes:\s*(\d+)/)?.[1]);
    const sourceWaitMinutes = Number(
      capture.match(/WIRELINE_VISUAL_SOURCE_WAIT_MS \|\| (\d+) \* 60_000/)?.[1],
    );

    expect(jobTimeoutMinutes).toBeGreaterThanOrEqual(45);
    expect(jobTimeoutMinutes).toBeGreaterThanOrEqual(sourceWaitMinutes + 30);
  });

  it("uses a stable demo sign-in without creating or mutating production records", () => {
    expect(capture).toContain("WIRELINE_VISUAL_EMAIL");
    expect(capture).toContain("WIRELINE_VISUAL_PASSWORD");
    expect(capture).toContain("WIRELINE_VISUAL_EXPECTED_EMAIL");
    expect(capture).toContain('accountEnvironment !== "demo"');
    expect(capture).toContain('fetch("/api/settings", { credentials: "same-origin" })');
    expect(capture).toContain("/signin?redirect=%2Fstudio");
    expect(capture).toContain("qaAccountConfigured");
    expect(capture).not.toMatch(/mailinator|signUp\(|auth-terms|completeOnboarding/i);
    expect(capture).not.toMatch(/Create and open Studio|Save fact|Change Plan|engineering\.test/);
  });

  it("writes and enforces a complete cryptographic evidence manifest", () => {
    expect(capture).toContain('path.join(outputRoot, "latest-manifest.json")');
    expect(capture).toContain('kind: "auth"');
    expect(capture).toContain("PRODUCTION_VISUAL_AUTHENTICATED_ROUTES");
    expect(capture).toContain('"phone,desktop,laptop,breakpoint,short"');
    expect(capture).toContain("path: `${prefix}-scroll-end.png`");
    expect(capture).toContain("routeReachedExactly(baseUrl, route, finalUrl)");
    expect(capture).toContain('createHash("sha256")');
    expect(capture).toContain("artifactDirectory: timestamp");
    expect(capture).toContain("assertCleanCheckout(repoRoot, sourceCommit)");
    expect(gate).toContain('"artifact"');
    expect(gate).toContain("authenticatedCapture !== true");
    expect(workflow).toContain("WIRELINE_VISUAL_EXPECTED_EMAIL: wireline.demo@trywireline.com");
    expect(workflow).toContain("WIRELINE_VISUAL_EMAIL: ${{ secrets.WIRELINE_VISUAL_EMAIL }}");
    expect(workflow).toContain("WIRELINE_VISUAL_PASSWORD: ${{ secrets.WIRELINE_VISUAL_PASSWORD }}");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^ {2}push:/m);
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain("WIRELINE_VISUAL_EXPECTED_COMMIT: ${{ inputs.release_sha }}");
    expect(workflow).toContain("env -u GITHUB_SHA node scripts/capture-prod-visual-qa.mjs");
    expect(workflow).toContain("ref: main");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain(
      'git merge-base --is-ancestor "$WIRELINE_VISUAL_EXPECTED_COMMIT" origin/main',
    );
    expect(workflow).toContain('git checkout --detach "$WIRELINE_VISUAL_EXPECTED_COMMIT"');
    expect(workflow.indexOf("git merge-base --is-ancestor")).toBeLessThan(
      workflow.indexOf("git checkout --detach"),
    );
    expect(workflow.indexOf("git checkout --detach")).toBeLessThan(workflow.indexOf("run: npm ci"));
    expect(workflow.indexOf("- name: Capture production routes")).toBeLessThan(
      workflow.indexOf("secrets.WIRELINE_VISUAL_PASSWORD"),
    );
    expect(workflow).toContain(
      "node scripts/check-visual-qa-manifest.mjs --production artifacts/visual-qa-prod/latest-manifest.json",
    );
    expect(workflow).toContain("!artifacts/visual-qa-prod/**/*-authenticated-*.png");
  });

  it("binds route semantics to stable page, dialog, tab, hash, and admin-panel attributes", () => {
    const marker = read("src/components/VisualQaMarker.tsx");
    const app = read("src/App.tsx");
    const routes = read("src/routes/AppRoutes.tsx");
    const dialog = read("src/components/CreateAgentDialog.tsx");
    const phone = read("src/pages/PhonePage.tsx");
    const phoneSetup = read("src/components/PhoneSetupPanel.tsx");
    const admin = read("src/components/AdminSettings.tsx");

    expect(marker).toContain("data-visual-qa-page");
    expect(marker).toContain("data-visual-qa-state");
    expect(app).toContain('withVisualQaPage(module, "solutions"');
    expect(app).toContain('"auth-portal"');
    expect(routes).toContain('withVisualQaPage(module, "settings", "billing")');
    expect(routes).toContain('page="authenticated-not-found" state="not-found"');
    expect(dialog).toContain('data-visual-qa-state="create-dialog"');
    expect(phone).toContain('data-visual-qa-state="primary-outbound"');
    expect(phone).toContain("`secondary-${outboundView}`");
    expect(phoneSetup).toContain('"company-identity" : undefined');
    expect(admin).toContain('data-visual-qa-state="panel-subscription"');
    expect(capture).not.toContain("criticalPublicContent");
    expect(capture).not.toContain('locator("body").innerText()');
  });

  it(
    "keeps the local PR visual gate focused on captured P0 issues",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "botbound-local-visual-gate-"));
      const manifestPath = join(directory, "manifest.json");
      try {
        writeFileSync(
          manifestPath,
          JSON.stringify({
            baseUrl: "http://127.0.0.1:3000",
            authenticatedCapture: false,
            viewports: [{ name: "phone-390", width: 390, height: 844 }],
            marketingRoutes: ["/"],
            authenticatedRoutes: [],
            compatibilityRoutes: [],
            issues: [],
          }),
        );
        expect(invokeGate(manifestPath, false).status).toBe(0);

        writeFileSync(
          manifestPath,
          JSON.stringify({
            baseUrl: "http://127.0.0.1:3000",
            issues: [{ kind: "capture", viewport: "phone-390", route: "/" }],
          }),
        );
        expect(invokeGate(manifestPath, false).status).toBe(1);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    visualGateTestTimeout(2),
  );

  it("matches redirects by exact parsed origin, pathname, query, and hash", () => {
    expect(
      routeReachedExactly(
        CANONICAL_PRODUCTION_VISUAL_BASE_URL,
        "/studio",
        "https://botbound.app/studio",
      ),
    ).toBe(true);
    expect(
      routeReachedExactly(
        CANONICAL_PRODUCTION_VISUAL_BASE_URL,
        "/status",
        "https://botbound.app/trust",
      ),
    ).toBe(true);
    expect(
      routeReachedExactly(
        CANONICAL_PRODUCTION_VISUAL_BASE_URL,
        "/studio",
        "https://botbound.app/studio-evil",
      ),
    ).toBe(false);
    expect(
      routeReachedExactly(
        CANONICAL_PRODUCTION_VISUAL_BASE_URL,
        "/",
        "https://botbound.app/pricing",
      ),
    ).toBe(false);
    expect(
      routeReachedExactly(
        CANONICAL_PRODUCTION_VISUAL_BASE_URL,
        "/studio",
        "https://example.com/studio",
      ),
    ).toBe(false);
    expect(
      routeReachedExactly(
        CANONICAL_PRODUCTION_VISUAL_BASE_URL,
        "/phone?tab=logs",
        "https://botbound.app/phone?tab=outbound",
      ),
    ).toBe(false);
    expect(
      routeReachedExactly(
        CANONICAL_PRODUCTION_VISUAL_BASE_URL,
        "/settings/phone#company-identity",
        "https://botbound.app/phone?tab=setup#company-identity",
      ),
    ).toBe(true);
  });

  it(
    "accepts complete evidence, including an optional authenticated scroll-end image",
    () => {
      withFixture(
        ({ run }) => {
          const result = run();
          expect(result.status, result.stderr).toBe(0);
        },
        { includeOptionalScrollEnd: true },
      );
    },
    visualGateTestTimeout(1),
  );

  it(
    "rejects missing, duplicate, failed, wrong-shell, and wrong-tab semantic evidence",
    () => {
      withFixture(({ manifest, run }) => {
        const missing = structuredClone(manifest);
        missing.semanticAssertions.pop();
        expect(run(missing).status).toBe(1);

        const duplicate = structuredClone(manifest);
        duplicate.semanticAssertions.push(structuredClone(duplicate.semanticAssertions[0]));
        expect(run(duplicate).status).toBe(1);

        const failed = structuredClone(manifest);
        failed.semanticAssertions[0].success = false;
        expect(run(failed).status).toBe(1);

        const wrongShell = structuredClone(manifest);
        const studio = wrongShell.semanticAssertions.find(
          (assertion: Manifest) =>
            assertion.viewport === "desktop" &&
            assertion.mode === "authenticated" &&
            assertion.route === "/studio",
        );
        studio.assertedPages = ["workspace-shell"];
        expect(run(wrongShell).status).toBe(1);

        const wrongTab = structuredClone(manifest);
        const campaigns = wrongTab.semanticAssertions.find(
          (assertion: Manifest) =>
            assertion.viewport === "desktop" &&
            assertion.mode === "authenticated" &&
            assertion.route === "/phone?tab=campaigns",
        );
        campaigns.assertedStates = ["primary-outbound", "secondary-callbacks"];
        expect(run(wrongTab).status).toBe(1);
      });
    },
    visualGateTestTimeout(5),
  );

  it(
    "rejects empty, partial, wrong-route, unauthenticated, and unsafe manifests",
    () => {
      withFixture(({ manifest, run }) => {
        const empty = {
          ...structuredClone(manifest),
          marketingRoutes: [],
          authenticatedRoutes: [],
          compatibilityRoutes: [],
          viewports: [],
          artifacts: [],
          screenshotCountExpected: 0,
          screenshotCountActual: 0,
        };
        expect(run(empty).status).toBe(1);

        const partial = structuredClone(manifest);
        partial.marketingRoutes.pop();
        expect(run(partial).status).toBe(1);

        const wrongRoute = structuredClone(manifest);
        wrongRoute.authenticatedRoutes[0] = "/studio-evil";
        expect(run(wrongRoute).status).toBe(1);

        expect(run({ ...structuredClone(manifest), authenticatedCapture: false }).status).toBe(1);
        expect(run({ ...structuredClone(manifest), qaAccountConfigured: false }).status).toBe(1);
        expect(run({ ...structuredClone(manifest), artifactDirectory: "../outside" }).status).toBe(
          1,
        );
        expect(
          run({
            ...structuredClone(manifest),
            screenshotCountExpected: manifest.screenshotCountExpected - 1,
          }).status,
        ).toBe(1);
      });
    },
    visualGateTestTimeout(7),
  );

  it(
    "rejects missing and cryptographically tampered PNG artifacts",
    () => {
      withFixture(({ artifactPath, manifest, run }) => {
        const first = manifest.artifacts[0].file;
        unlinkSync(join(artifactPath, first));
        expect(run().status).toBe(1);

        writeFileSync(join(artifactPath, first), PNG);
        const second = manifest.artifacts[1].file;
        const tampered = Buffer.from(PNG);
        tampered[tampered.length - 1] ^= 1;
        writeFileSync(join(artifactPath, second), tampered);
        expect(run().status).toBe(1);
      });
    },
    visualGateTestTimeout(2),
  );

  it(
    "fails request, API-response, and release-provenance defects",
    () => {
      withFixture(({ manifest, run }) => {
        expect(
          run({
            ...structuredClone(manifest),
            issues: [{ kind: "request", viewport: "desktop", route: "/studio" }],
          }).status,
        ).toBe(1);
        expect(
          run({
            ...structuredClone(manifest),
            issues: [{ kind: "api-response", viewport: "desktop", route: "/studio" }],
          }).status,
        ).toBe(1);
        expect(run({ ...structuredClone(manifest), sourceProofAfter: undefined }).status).toBe(1);
        expect(
          run({
            ...structuredClone(manifest),
            sourceProofAfter: {
              baseURL: CANONICAL_PRODUCTION_VISUAL_BASE_URL,
              deployedCommit: "b".repeat(40),
              verifiedAt: new Date(0).toISOString(),
            },
          }).status,
        ).toBe(1);
      });
    },
    visualGateTestTimeout(4),
  );
});
