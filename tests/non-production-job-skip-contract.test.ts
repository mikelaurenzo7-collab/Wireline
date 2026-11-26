import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_ENVIRONMENT_UNAVAILABLE,
  liveExternalActionPolicy,
  NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
} from "../src/lib/account-environment-policy";

const worker = readFileSync(resolve(process.cwd(), "src/lib/job-worker.ts"), "utf8");
const dispatch = worker.slice(
  worker.indexOf("async function dispatchJob(job"),
  worker.indexOf("export async function handleJob(job"),
);

describe("provider-spend jobs owned by demo or test workspaces", () => {
  it("finish with the reason recorded instead of retrying a refusal that cannot pass", () => {
    // The admission gate keeps its position ahead of every handler.
    expect(dispatch).toContain(
      "assertProviderSpendJobEnvironmentAllowed({ type: job.type, userId })",
    );
    expect(dispatch).toContain("if (isNonProductionWorkspaceRefusal(error)) {");
    expect(dispatch).toContain(
      'await persistJobResult(job.id, { skipped: "non_production_workspace" });',
    );
    expect(dispatch).toMatch(
      /isNonProductionWorkspaceRefusal\(error\)\) \{[\s\S]*?return;\s*\}\s*throw error;/,
    );
    expect(dispatch.indexOf("isNonProductionWorkspaceRefusal")).toBeLessThan(
      dispatch.indexOf("dispatchJobInProviderContext(job)"),
    );
  });

  it("only skips the deterministic demo/test refusal; an unclassified workspace still retries", () => {
    expect(worker).toMatch(
      /function isNonProductionWorkspaceRefusal\(error: unknown\): boolean \{[\s\S]*?error\.status === 403 &&[\s\S]*?error\.code === NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED/,
    );
    for (const environment of ["demo", "test"]) {
      expect(liveExternalActionPolicy(environment)).toMatchObject({
        allowed: false,
        status: 403,
        code: NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
      });
    }
    // Missing classification is a 503 with a different code: it keeps the
    // queue's normal retry and dead-letter path.
    expect(liveExternalActionPolicy(null)).toMatchObject({
      allowed: false,
      status: 503,
      code: ACCOUNT_ENVIRONMENT_UNAVAILABLE,
    });
    expect(liveExternalActionPolicy("production")).toMatchObject({ allowed: true });
  });
});
