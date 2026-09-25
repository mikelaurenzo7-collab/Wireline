import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain .mjs helper shared by release scripts.
import {
  assertProductionDeploymentProvenance,
  assertReadyProductionDeployment,
  assertRedeploySource,
  normalizeDeploymentId,
  normalizeExactCommitSha,
} from "./vercel-deployment-policy.mjs";

const PROJECT_ID = "prj_canonical";
const COMMIT_SHA = "a".repeat(40);

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: "dpl_exactSource1",
    project: { id: PROJECT_ID },
    target: "production",
    readyState: "READY",
    meta: { githubCommitRef: "main", githubCommitSha: COMMIT_SHA },
    alias: ["botbound.app"],
    aliasError: null,
    ...overrides,
  };
}

const options = { expectedCommitSha: COMMIT_SHA, projectId: PROJECT_ID };

describe("Vercel production deployment policy", () => {
  it("requires explicit deployment IDs and exact commit SHAs", () => {
    expect(normalizeDeploymentId(" dpl_exactSource1 ")).toBe("dpl_exactSource1");
    expect(normalizeExactCommitSha(COMMIT_SHA.toUpperCase())).toBe(COMMIT_SHA);
    for (const value of ["", "latest", "wireline.vercel.app"]) {
      expect(() => normalizeDeploymentId(value)).toThrow(/explicit Vercel deployment ID/);
    }
    for (const value of ["", "a".repeat(39), "main"]) {
      expect(() => normalizeExactCommitSha(value)).toThrow(/exact 40-character commit SHA/);
    }
  });

  it.each(["ERROR", "READY"])("accepts an exact terminal %s source", (state) => {
    expect(assertRedeploySource(deployment({ readyState: state }), options)).toMatchObject({
      deploymentId: "dpl_exactSource1",
      projectId: PROJECT_ID,
      target: "production",
      state,
      commitRef: "main",
      commitSha: COMMIT_SHA,
    });
  });

  it("rejects stale, preview, foreign-project, non-main, and nonterminal sources", () => {
    const invalid = [
      deployment({ project: { id: "prj_other" } }),
      deployment({ target: null }),
      deployment({ meta: { githubCommitRef: "feature", githubCommitSha: COMMIT_SHA } }),
      deployment({ meta: { githubCommitRef: "main", githubCommitSha: "b".repeat(40) } }),
      deployment({ readyState: "BUILDING" }),
      deployment({ readyState: "CANCELED" }),
    ];
    for (const candidate of invalid) {
      expect(() => assertRedeploySource(candidate, options)).toThrow();
    }
  });

  it("validates provenance while a new exact deployment is still building", () => {
    expect(
      assertProductionDeploymentProvenance(deployment({ readyState: "BUILDING" }), options),
    ).toMatchObject({ state: "BUILDING", commitSha: COMMIT_SHA });
  });

  it("certifies only a clean READY deployment that owns the canonical alias", () => {
    expect(
      assertReadyProductionDeployment(deployment(), {
        ...options,
        canonicalAlias: "https://botbound.app",
      }),
    ).toMatchObject({ state: "READY", aliasHosts: ["botbound.app"] });

    for (const candidate of [
      deployment({ readyState: "BUILDING" }),
      deployment({ aliasError: { code: "conflict" } }),
      deployment({ alias: ["wireline-git-main-revaluate.vercel.app"] }),
    ]) {
      expect(() =>
        assertReadyProductionDeployment(candidate, {
          ...options,
          canonicalAlias: "botbound.app",
        }),
      ).toThrow();
    }
  });
});
