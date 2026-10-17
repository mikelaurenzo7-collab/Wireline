#!/usr/bin/env node
/** Deliberate, one-parent backfill. This command never runs a provider operation. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getDeploymentIdentity,
  type DeploymentEnvironment,
} from "../src/lib/deployment-environment";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SOURCE = /^[a-f0-9]{40}$/;
const USAGE =
  "node --import tsx scripts/recover-post-call-finalization.mts --job-id UUID --user-id UUID --expected-source SHA [--apply]";

export class PostCallRecoveryOperatorError extends Error {}

export function parsePostCallRecoveryArguments(args: string[]) {
  const values = new Map<string, string>();
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--apply" && !apply) {
      apply = true;
      continue;
    }
    if (
      !["--job-id", "--user-id", "--expected-source"].includes(flag) ||
      values.has(flag) ||
      !args[index + 1] ||
      args[index + 1].startsWith("--")
    )
      throw new PostCallRecoveryOperatorError(USAGE);
    values.set(flag, args[++index]);
  }
  const parentJobId = values.get("--job-id") ?? "";
  const userId = values.get("--user-id") ?? "";
  const expectedSource = values.get("--expected-source") ?? "";
  if (!UUID.test(parentJobId) || !UUID.test(userId) || !SOURCE.test(expectedSource))
    throw new PostCallRecoveryOperatorError(USAGE);
  return {
    parentJobId: parentJobId.toLowerCase(),
    userId: userId.toLowerCase(),
    expectedSource,
    apply,
  };
}

export function assertPostCallRecoveryOperatorEnvironment(
  env: DeploymentEnvironment,
  expectedSource: string,
  release: { role?: string; revision?: string },
  checkoutSource: string,
) {
  const identity = getDeploymentIdentity(env);
  if (
    !SOURCE.test(expectedSource) ||
    identity.provider !== "render" ||
    identity.environment !== "production" ||
    env.NODE_ENV !== "production" ||
    identity.branch !== "main" ||
    identity.sourceCommit !== expectedSource ||
    release.role !== "api" ||
    release.revision !== expectedSource ||
    checkoutSource !== expectedSource ||
    (env.WIRELINE_SOURCE_REVISION && env.WIRELINE_SOURCE_REVISION !== expectedSource) ||
    env.WIRELINE_VOICE_WORKER === "true" ||
    env.APP_URL?.trim().replace(/\/+$/, "") !== "https://botbound.app"
  )
    throw new PostCallRecoveryOperatorError(
      "Recovery requires the exact reviewed Render production main API release.",
    );
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(USAGE);
    return;
  }
  const options = parsePostCallRecoveryArguments(args);
  const release = JSON.parse(
    readFileSync(new URL("../dist/render-release.json", import.meta.url), "utf8"),
  );
  const checkoutSource = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5_000,
  }).trim();
  assertPostCallRecoveryOperatorEnvironment(
    process.env,
    options.expectedSource,
    release,
    checkoutSource,
  );
  // Import database authority only after verifying the production role and artifact.
  const [{ and, eq }, schema, context, recovery, { writeTransactionConfig }] = await Promise.all([
    import("drizzle-orm"),
    import("../src/db/schema"),
    import("../src/lib/server-context"),
    import("../src/lib/post-call-finalization-recovery"),
    import("../src/lib/job-queue"),
  ]);
  try {
    const result = await context.tenantStore.run(options.userId, async () => {
      if (options.apply)
        return context.drizzle.transaction(
          (tx) => recovery.enqueuePostCallFinalizationRecovery(tx, options),
          writeTransactionConfig(),
        );
      const [parent] = await context.drizzle
        .select()
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, options.parentJobId), eq(schema.jobs.userId, options.userId)))
        .limit(1);
      const candidate = recovery.postCallFinalizationRecoveryEligibility(parent);
      return {
        structuralCandidate: candidate.eligible,
        created: false,
        authoritativeCallRevalidation: "apply_only",
        ...(!candidate.eligible ? { reason: candidate.reason } : {}),
      };
    });
    console.log(
      JSON.stringify({
        mode: options.apply ? "enqueue" : "read-only",
        source: options.expectedSource,
        ...result,
        providerWorkInvokedByCommand: false,
      }),
    );
  } finally {
    await context.db.$client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof PostCallRecoveryOperatorError
        ? error.message
        : "Post-call recovery could not be verified or queued. Inspect redacted operator logs before retrying.",
    );
    process.exitCode = 1;
  });
}
