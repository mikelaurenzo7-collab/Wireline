import { pathToFileURL } from "node:url";

// Operator command, never a Render preDeployCommand: drain BEFORE replacement.
// An interrupted observation can resume without reopening voice admissions.
export async function drainVoice({
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log,
} = {}) {
  const origin = new URL(env.WIRELINE_VOICE_WORKER_URL || "");
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  )
    throw new Error("WIRELINE_VOICE_WORKER_URL must be the old worker's HTTPS origin.");
  const secret = env.WIRELINE_VOICE_WORKER_SECRET?.trim() || "";
  if (Buffer.byteLength(secret) < 32)
    throw new Error("The old worker's service credential is required.");
  const expectedRevision = env.VOICE_DRAIN_EXPECTED_REVISION?.trim().toLowerCase() || "";
  if (!/^[a-f0-9]{40}$/.test(expectedRevision))
    throw new Error("VOICE_DRAIN_EXPECTED_REVISION must identify the old deployed worker.");

  async function request(path, method = "GET") {
    const response = await fetchImpl(new URL(path, origin), {
      method,
      redirect: "error",
      headers: {
        "x-botbound-voice-worker-key": secret,
        "x-botbound-expected-source-revision": expectedRevision,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`Worker ${path} returned HTTP ${response.status}; do not replace it.`);
    return response.json();
  }
  function validate(state) {
    if (
      !state ||
      state.source_revision !== expectedRevision ||
      !Number.isSafeInteger(state.max_call_seconds) ||
      state.max_call_seconds <= 0 ||
      typeof state.draining !== "boolean" ||
      !Number.isSafeInteger(state.active) ||
      state.active < 0 ||
      !Number.isSafeInteger(state.pending) ||
      state.pending < 0
    )
      throw new Error("Invalid drain identity or work counts; do not replace the worker.");
  }

  let state = await request("/drain");
  validate(state);
  const maxCallSeconds = state.max_call_seconds;
  if (!state.draining) {
    const readiness = await request("/readyz");
    if (
      readiness.ready !== true ||
      readiness.source_revision !== expectedRevision ||
      readiness.max_call_seconds !== maxCallSeconds
    )
      throw new Error("Worker identity/readiness does not match the instance selected for drain.");
    state = await request("/drain", "POST");
  }
  const deadline = now() + (maxCallSeconds + 300) * 1_000;
  let last = "";
  while (true) {
    validate(state);
    if (!state.draining || state.max_call_seconds !== maxCallSeconds)
      throw new Error("Drain state changed; do not replace the worker.");
    const summary = JSON.stringify({
      draining: true,
      active: state.active,
      pending: state.pending,
    });
    if (summary !== last) log(summary);
    last = summary;
    if (state.active === 0 && state.pending === 0) break;
    if (now() >= deadline)
      throw new Error("Drain deadline elapsed with remaining work; leave the old worker running.");
    await sleep(5_000);
    state = await request("/drain");
  }
  log(JSON.stringify({ drained: true, source_revision: expectedRevision }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await drainVoice();
