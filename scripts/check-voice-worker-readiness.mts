import { execFileSync } from "node:child_process";
import { probeVoiceWorkerReadiness } from "../src/lib/voice/openai-sip-worker-readiness";

let expected =
  process.env.WIRELINE_EXPECTED_SOURCE_REVISION?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  "";
if (!expected) {
  try {
    expected = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }).trim();
  } catch {
    // The shared probe emits a safe missing-revision failure.
  }
}
const result = await probeVoiceWorkerReadiness(expected);
console.log(JSON.stringify(result));
if (!result.ready) process.exitCode = 1;
