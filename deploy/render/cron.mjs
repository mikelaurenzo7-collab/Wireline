const paths = Object.freeze({
  "jobs-sweep": "/api/jobs/sweep",
  "daily-brief": "/api/daily-brief/schedule",
});
const job = process.argv[2];
if (!Object.hasOwn(paths, job))
  throw new Error("Usage: node deploy/render/cron.mjs jobs-sweep|daily-brief");

async function main() {
  // Initial Blueprint creation must not duplicate the existing scheduler or
  // begin processing the shared production queue before the controlled cutover.
  if (process.env.RENDER_CRON_ENABLED !== "true") {
    console.log(JSON.stringify({ job, enabled: false, skipped: true }));
    return;
  }
  const origin = new URL(process.env.BOTBOUND_BACKEND_ORIGIN || "");
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
  const cronSecret = process.env.CRON_SECRET?.trim() || "";
  if (Buffer.byteLength(cronSecret) < 16) {
    throw new Error("The cron service requires the API's CRON_SECRET.");
  }
  const response = await fetch(new URL(paths[job], origin), {
    method: "GET",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      Accept: "application/json",
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
  console.log(JSON.stringify(summary));
  if (typeof result.failed === "number" && result.failed > 0)
    throw new Error("One or more scheduled operations failed; inspect protected API logs.");
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      job,
      failed: true,
      error: error instanceof Error ? error.message : "Scheduled request failed.",
    }),
  );
  process.exitCode = 1;
});
