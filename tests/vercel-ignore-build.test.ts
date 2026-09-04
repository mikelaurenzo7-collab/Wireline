import { describe, expect, it } from "vitest";

import {
  isExplicitBuildRequested,
  isIgnorableChangeSet,
  isNonRuntimeOnlyPath,
  resolveVercelDiffRange,
} from "../scripts/vercel-ignore-build.mjs";

describe("Vercel ignored-build classifier", () => {
  it("skips only a non-empty set of non-runtime changes", () => {
    expect(
      isIgnorableChangeSet([
        "docs/DEPLOYMENT_RUNBOOK.md",
        "tests/example.test.ts",
        ".github/workflows/ci.yml",
        "android/app/build.gradle",
        "ios/Wireline/App.swift",
        "apps/botbound-film/src/Launch.tsx",
        "README.md",
      ]),
    ).toBe(true);
    expect(isIgnorableChangeSet([])).toBe(false);
  });

  it.each([
    "src/App.tsx",
    "api/index.ts",
    "public/og-image.svg",
    "server.ts",
    "scripts/check-prod-env.mjs",
    "drizzle/migrations/0173.sql",
    "package.json",
    "pnpm-lock.yaml",
    "vite.config.ts",
    "tsconfig.json",
    "vercel.json",
    "brand-work/launch/assets/poster.png",
  ])("retains the build for %s", (file) => {
    expect(isNonRuntimeOnlyPath(file)).toBe(false);
  });

  it("never ignores an explicitly requested exact-head deep audit", () => {
    expect(
      isExplicitBuildRequested({
        VERCEL_GIT_COMMIT_MESSAGE:
          "test: certify authenticated design ownership [launch-deep-audit]",
      }),
    ).toBe(true);
    expect(
      isExplicitBuildRequested({ VERCEL_GIT_COMMIT_MESSAGE: "docs: update launch notes" }),
    ).toBe(false);
    expect(isExplicitBuildRequested({})).toBe(false);
  });

  it("diffs from the last successful Vercel deployment and fails closed without it", () => {
    const previousSha = "a".repeat(40);

    expect(resolveVercelDiffRange({ VERCEL_GIT_PREVIOUS_SHA: previousSha })).toEqual([
      previousSha,
      "HEAD",
    ]);
    expect(resolveVercelDiffRange({})).toBeNull();
    expect(resolveVercelDiffRange({ VERCEL_GIT_PREVIOUS_SHA: "HEAD^" })).toBeNull();
  });
});

// Exact-head certification must exercise the ignored-build override and the full release audit.
