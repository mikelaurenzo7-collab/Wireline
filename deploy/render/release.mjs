import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { drainVoice, voiceDrainClient } from "./drain-voice.mjs";
import { CANONICAL_PRODUCTION_URL } from "../../scripts/lib/production-url.mjs";

const REPO = "https://github.com/mikelaurenzo7-collab/Wireline";
const WORKSPACE = "tea-d6cgo7kr85hc738l3lh0";
const VOICE_ORIGIN = "https://botbound-voice.onrender.com";
const SERVICES = [
  { name: "botbound-api", id: "srv-daqamngu01pc73ffteeg", trigger: "commit" },
  { name: "botbound-voice", id: "srv-daqaoo97lnhs73cbapeg", trigger: "off" },
  { name: "botbound-jobs-sweep", id: "crn-darv1k3bc2fs738lnr5g", trigger: "commit" },
  { name: "botbound-daily-brief", id: "crn-darv1n17lnhs73ev5qm0", trigger: "commit" },
];
const ACTIVE_DEPLOYS = [
  "created",
  "queued",
  "build_in_progress",
  "pre_deploy_in_progress",
  "update_in_progress",
];
const TERMINAL_DEPLOYS = new Set([
  "deactivated",
  "build_failed",
  "pre_deploy_failed",
  "update_failed",
  "canceled",
]);
const SHA = /^[0-9a-f]{40}$/;
const USAGE = [
  "node deploy/render/release.mjs plan <current-sha> <candidate-sha>",
  "node deploy/render/release.mjs drain <current-sha> <candidate-sha>",
  "node deploy/render/release.mjs verify <candidate-sha>",
].join("\n");

function runGit(args, env) {
  try {
    return execFileSync("git", args, {
      env,
      encoding: "utf8",
      timeout: 20_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error(`Git ${args[0]} could not verify the release checkout or remote.`);
  }
}

function verifySource(git, current, candidate) {
  const origin = git(["remote", "get-url", "origin"]);
  if (
    !/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)mikelaurenzo7-collab\/Wireline(?:\.git)?$/i.test(
      origin,
    )
  ) {
    throw new Error("The release checkout must use the BotBound GitHub repository as origin.");
  }
  if (git(["rev-parse", "HEAD"]) !== candidate || git(["status", "--porcelain"])) {
    throw new Error("Check out the exact candidate in a clean BotBound worktree.");
  }
  const main = git(["ls-remote", "--exit-code", "--refs", "origin", "refs/heads/main"]);
  if (main !== `${current}\trefs/heads/main`) {
    throw new Error("GitHub main changed or does not match the expected production revision.");
  }
  if (current !== candidate) {
    try {
      git(["merge-base", "--is-ancestor", current, candidate]);
    } catch {
      throw new Error("The candidate must be a fast-forward of the current production commit.");
    }
  }
}

async function readJson(fetchImpl, url, label, headers = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: "error",
      cache: "no-store",
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return await response.json();
  } catch {
    throw new Error(`Could not read ${label}.`);
  }
  throw new Error(`${label} returned HTTP ${response.status}.`);
}

async function observeProduction(fetchImpl, token, revision) {
  const render = (path, label) =>
    readJson(fetchImpl, new URL(path, "https://api.render.com/v1/"), label, {
      Authorization: `Bearer ${token}`,
    });
  const deployments = await Promise.all(
    SERVICES.map(async ({ name, id, trigger }) => {
      const service = await render(`services/${id}`, name);
      if (
        service?.id !== id ||
        service.name !== name ||
        service.ownerId !== WORKSPACE ||
        service.branch !== "main" ||
        service.repo !== REPO ||
        service.autoDeployTrigger !== trigger ||
        (trigger === "off" && service.serviceDetails?.url !== VOICE_ORIGIN)
      ) {
        throw new Error(`${name} no longer matches the production release configuration.`);
      }
      const query = new URLSearchParams({ limit: "100" });
      for (const status of ["live", ...ACTIVE_DEPLOYS]) query.append("status", status);
      const history = await render(`services/${id}/deploys?${query}`, `${name} deploys`);
      if (!Array.isArray(history) || history.length >= 100) {
        throw new Error(`Could not verify a complete active deploy list for ${name}.`);
      }
      const deploys = history.map((entry) => entry?.deploy);
      if (
        deploys.some((entry) => entry?.status !== "live" && !TERMINAL_DEPLOYS.has(entry?.status))
      ) {
        throw new Error(`${name} has a queued, active, or unknown deployment state.`);
      }
      const live = deploys.filter((entry) => entry?.status === "live");
      if (
        live.length !== 1 ||
        live[0].commit?.id !== revision ||
        !/^dep-[a-z0-9]+$/.test(live[0].id)
      ) {
        throw new Error(`${name} is not live on ${revision}.`);
      }
      return { service: name, deploy: live[0].id, revision };
    }),
  );
  const api = await readJson(
    fetchImpl,
    new URL("/healthz", CANONICAL_PRODUCTION_URL),
    "BotBound API health",
  );
  if (api?.alive !== true || api.trafficEnabled !== true || api.sourceCommit !== revision) {
    throw new Error("BotBound's public API traffic or source revision does not match the release.");
  }
  return deployments;
}

export async function runRelease({
  args,
  env = process.env,
  fetchImpl = fetch,
  git = runGit,
  sleep,
  log = console.log,
}) {
  const [mode, first, second, ...rest] = args;
  const verifying = mode === "verify";
  if (
    !["plan", "drain", "verify"].includes(mode) ||
    !SHA.test(first || "") ||
    (verifying ? second !== undefined : !SHA.test(second || "") || first === second) ||
    rest.length
  ) {
    throw new Error(USAGE);
  }
  const current = first;
  const candidate = verifying ? first : second;
  const gitEnv = { ...env };
  delete gitEnv.RENDER_API_KEY;
  delete gitEnv.WIRELINE_VOICE_WORKER_SECRET;
  const verifyGit = () => verifySource((args) => git(args, gitEnv), current, candidate);
  verifyGit();

  const token = env.RENDER_API_KEY?.trim();
  if (!token)
    throw new Error(
      "The release operator needs a Render API token with service and deploy read access.",
    );
  const voiceEnv = {
    WIRELINE_VOICE_WORKER_URL: VOICE_ORIGIN,
    WIRELINE_VOICE_WORKER_SECRET: env.WIRELINE_VOICE_WORKER_SECRET,
    VOICE_DRAIN_EXPECTED_REVISION: current,
  };
  const worker = voiceDrainClient({ env: voiceEnv, fetchImpl });
  const deployments = await observeProduction(fetchImpl, token, current);
  let state = await worker.readState();

  if (verifying && state.draining) throw new Error("The new voice worker is still draining.");
  if (mode === "drain") {
    verifyGit();
    await drainVoice({ env: voiceEnv, fetchImpl, sleep, log });
    const after = await observeProduction(fetchImpl, token, current);
    if (after.some((item, index) => item.deploy !== deployments[index].deploy)) {
      throw new Error(
        "A Render deploy changed during the drain. Inspect the live workers before promotion.",
      );
    }
    state = await worker.readState();
    if (!state.draining || state.active !== 0 || state.pending !== 0) {
      throw new Error("The old voice worker no longer reports an empty drain.");
    }
  } else if (!state.draining) {
    await worker.verifyReady(state.max_call_seconds);
  }
  verifyGit();
  return {
    mode,
    current,
    candidate,
    deployments,
    voice: { draining: state.draining, active: state.active, pending: state.pending },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === "--help") {
    console.log(USAGE);
  } else {
    try {
      console.log(JSON.stringify(await runRelease({ args }), null, 2));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
