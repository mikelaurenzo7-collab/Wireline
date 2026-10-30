import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const fullRevision = /^[a-f0-9]{40}$/;
const root = fileURLToPath(new URL("../../", import.meta.url));

function runWorkerProcess(command, args, options) {
  return new Promise((resolve) => {
    execFile(command, args, options, (error, stdout) => {
      resolve({ status: error ? 1 : 0, stdout });
    });
  });
}

export function resolveLaunchProvider(args = []) {
  const index = args.indexOf("--provider");
  const provider = index < 0 ? "render" : args[index + 1];
  if (provider !== "render") {
    throw new Error("--provider must be render only (Vercel retired, T1).");
  }
  return provider;
}

/** Reuse the authenticated source, duration and signing-parity probe. */
export async function readLaunchWorker(
  expectedRevision,
  { run = runWorkerProcess, env = process.env } = {},
) {
  const unavailable = {
    ready: false,
    detail: "Authenticated voice-worker readiness could not be verified.",
  };
  try {
    const child = await run(
      process.execPath,
      ["--import", "tsx", "scripts/check-voice-worker-readiness.mts"],
      {
        cwd: root,
        env: { ...env, WIRELINE_EXPECTED_SOURCE_REVISION: expectedRevision },
        encoding: "utf8",
        timeout: 20_000,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
    );
    const result = JSON.parse(child.stdout || "{}");
    if (typeof result.ready !== "boolean" || typeof result.detail !== "string") return unavailable;
    return {
      ready:
        child.status === 0 &&
        result.ready &&
        result.expected_source_revision === expectedRevision &&
        result.worker_source_revision === expectedRevision &&
        Number.isInteger(result.max_call_seconds) &&
        result.max_call_seconds > 0,
      detail: result.detail,
      expected_source_revision: expectedRevision,
      worker_source_revision: fullRevision.test(result.worker_source_revision || "")
        ? result.worker_source_revision
        : null,
      max_call_seconds: Number.isInteger(result.max_call_seconds) ? result.max_call_seconds : null,
    };
  } catch {
    // Child stderr and transport errors can contain private configuration.
    return unavailable;
  }
}

/** Public liveness alone never certifies the persistent telephone worker. */
export async function readLaunchDeployment({
  provider,
  productionUrl,
  expectedRevision,
  readJson,
  readWorker = readLaunchWorker,
}) {
  if (provider !== "render") throw new Error("Unknown launch deployment provider.");
  if (!fullRevision.test(expectedRevision || "")) {
    return { provider, status: "blocked", blockers: ["expected_release_revision_invalid"] };
  }

  const [api, worker] = await Promise.all([
    readJson(`${productionUrl}/healthz`, { redirect: "error", cache: "no-store" }),
    Promise.resolve().then(() => readWorker(expectedRevision)),
  ]);
  const body = api.body;
  const revision = typeof body?.sourceCommit === "string" ? body.sourceCommit : "";
  const blockers = [];
  if (!api.ok) blockers.push("render_unreachable");
  else if (
    body?.alive !== true ||
    typeof body.trafficEnabled !== "boolean" ||
    !fullRevision.test(revision)
  ) {
    blockers.push("render_release_identity_invalid");
  } else {
    if (revision !== expectedRevision) blockers.push("production_commit_mismatch");
    if (!body.trafficEnabled) blockers.push("render_traffic_disabled");
  }
  if (!worker.ready) blockers.push("voice_worker_not_ready");
  return {
    provider,
    status: blockers.length ? "blocked" : "ready",
    production_commit: fullRevision.test(revision) ? revision : null,
    http_status: api.status,
    traffic_enabled: typeof body?.trafficEnabled === "boolean" ? body.trafficEnabled : null,
    worker,
    blockers,
  };
}
