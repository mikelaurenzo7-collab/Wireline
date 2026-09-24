import { pathToFileURL } from "node:url";

const paths = Object.freeze({
  "jobs-sweep": "/api/jobs/sweep",
  "daily-brief": "/api/daily-brief/schedule",
});
export async function runCron(
  job,
  { env = process.env, fetchImpl = fetch, log = console.log } = {},
) {
  if (!Object.hasOwn(paths, job)) throw new Error("Unknown scheduled job.");
  // Initial Blueprint creation must not duplicate the existing scheduler or
  // begin processing the shared production queue before the controlled cutover.
  if (env.RENDER_CRON_ENABLED !== "true") {
    log(JSON.stringify({ job, enabled: false, skipped: true }));
    return;
  }
  const revision = env.RENDER_GIT_COMMIT?.trim().toLowerCase() || "";
  if (
    env.RENDER !== "true" ||
    env.IS_PULL_REQUEST !== "false" ||
    env.RENDER_GIT_BRANCH !== "main" ||
    env.NODE_ENV !== "production" ||
    env.WIRELINE_DEPLOYMENT_ENVIRONMENT !== "production" ||
    !/^[a-f0-9]{40}$/.test(revision) ||
    env.WIRELINE_SOURCE_REVISION !== revision ||
    ["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_COMMIT_SHA"].some((key) =>
      env[key]?.trim(),
    )
  )
    throw new Error("Scheduled work requires a verified Render production main release.");
  const origin = new URL(env.BOTBOUND_BACKEND_ORIGIN || "");
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  ) {
    throw new Error("BOTBOUND_BACKEND_ORIGIN must be the Render API's HTTPS origin.");
  }
  const cronSecret = env.CRON_SECRET?.trim() || "";
  if (Buffer.byteLength(cronSecret) < 16) {
    throw new Error("The cron service requires the API's CRON_SECRET.");
  }
  const health = await fetchImpl(new URL("/healthz", origin), {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!health.ok) throw new Error(`API liveness returned HTTP ${health.status}.`);
  const identity = await health.json();
  if (
    identity?.alive !== true ||
    identity.trafficEnabled !== true ||
    identity.sourceCommit !== revision
  )
    throw new Error("API traffic or source revision does not match this scheduled release.");
  const response = await fetchImpl(new URL(paths[job], origin), {
    method: "GET",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      Accept: "application/json",
      // Recheck at admission in case the API changed after the liveness probe.
      "x-botbound-expected-source-revision": revision,
    },
    // A client timeout is an operational failure, not cancellation of the
    // server's durable work. Do not retry here or claim a remote cancellation.
    signal: AbortSignal.timeout(590_000),
  });
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}.`);
  if (!(response.headers.get("content-type") || "").includes("application/json")) {
    throw new Error("Backend did not return the expected JSON response.");
  }
  const result = await response.json();
  if (!result || typeof result !== "object" || result.ok === false)
    throw new Error("Backend reported an unsuccessful job.");
  const summary = { job, status: response.status };
  for (const key of ["processed", "recovered", "sent", "failed", "already_running"]) {
    if (typeof result[key] === "number" || typeof result[key] === "boolean")
      summary[key] = result[key];
  }
  // Do not copy tenant IDs, provider error bodies, or credentials into cron logs.
  log(JSON.stringify(summary));
  if (typeof result.failed === "number" && result.failed > 0)
    throw new Error("One or more scheduled operations failed; inspect protected API logs.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  throw new Error(
    "Use node deploy/render/start.mjs jobs-sweep|daily-brief to verify the release artifact.",
  );
