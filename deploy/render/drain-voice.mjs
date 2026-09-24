// Operator command, never a Render preDeployCommand: drain BEFORE starting
// replacement. Render's 300-second SIGTERM window cannot preserve hour calls.
const origin = new URL(process.env.WIRELINE_VOICE_WORKER_URL || "");
if (
  origin.protocol !== "https:" ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash ||
  origin.pathname !== "/"
) {
  throw new Error("WIRELINE_VOICE_WORKER_URL must be the old worker's HTTPS origin.");
}
const secret = process.env.WIRELINE_VOICE_WORKER_SECRET?.trim() || "";
if (Buffer.byteLength(secret) < 32)
  throw new Error("The old worker's service credential is required.");
const expectedRevision = process.env.VOICE_DRAIN_EXPECTED_REVISION?.trim().toLowerCase() || "";
if (!/^[a-f0-9]{40}$/.test(expectedRevision))
  throw new Error("VOICE_DRAIN_EXPECTED_REVISION must identify the old deployed worker.");

async function request(path, method = "GET") {
  const response = await fetch(new URL(path, origin), {
    method,
    redirect: "error",
    headers: { "x-botbound-voice-worker-key": secret },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Worker ${path} returned HTTP ${response.status}; do not replace it.`);
  return response.json();
}

const readiness = await request("/readyz");
if (
  readiness.ready !== true ||
  readiness.source_revision !== expectedRevision ||
  !Number.isInteger(readiness.max_call_seconds)
) {
  throw new Error("Worker identity/readiness does not match the instance selected for drain.");
}
const deadline = Date.now() + (readiness.max_call_seconds + 300) * 1_000;
let state = await request("/drain", "POST");
let last = "";
while (true) {
  if (
    state.draining !== true ||
    !Number.isInteger(state.active) ||
    !Number.isInteger(state.pending) ||
    state.active < 0 ||
    state.pending < 0
  ) {
    throw new Error("Invalid drain evidence; do not replace the worker.");
  }
  const summary = JSON.stringify({ draining: true, active: state.active, pending: state.pending });
  if (summary !== last) console.log(summary);
  last = summary;
  if (state.active === 0 && state.pending === 0) break;
  if (Date.now() >= deadline)
    throw new Error("Drain deadline elapsed with remaining work; leave the old worker running.");
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  state = await request("/drain");
}
console.log(JSON.stringify({ drained: true, source_revision: expectedRevision }));
