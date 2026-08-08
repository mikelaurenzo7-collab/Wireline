import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// The nightly demo-line canary pages OWNER_EMAIL when a line looks unhealthy.
// A single cold-start timeout on the Vapi API must not create a false page:
// production showed one "Assistant unreachable: operation aborted due to
// timeout" alert for a line that was otherwise fine. The fix retries only the
// transient (timeout/network) path, never a definitive HTTP status, so a real
// outage (deleted assistant -> 404) still alerts immediately.
describe("demo-line canary is resilient to transient timeouts", () => {
  const canary = read("src/lib/demo-line-canary.ts");
  const vapiFetch = canary.slice(
    canary.indexOf("async function vapiFetch("),
    canary.indexOf("async function probeLine("),
  );

  it("retries a transient failure but not a definitive HTTP status", () => {
    // Bounded transient retry lives on the catch (timeout/abort) path.
    expect(vapiFetch).toContain("VAPI_FETCH_TRANSIENT_RETRIES");
    expect(vapiFetch).toContain("attempt <= VAPI_FETCH_TRANSIENT_RETRIES");
    // A non-ok HTTP response returns without retrying.
    expect(vapiFetch).toMatch(
      /if \(!res\.ok\)[\s\S]*?return \{ ok: false, error: `Vapi \$\{res\.status\}/,
    );
    // The retry only happens inside the catch block, before exhausting attempts.
    const catchIdx = vapiFetch.indexOf("} catch (err: any) {");
    expect(catchIdx).toBeGreaterThan(-1);
    expect(vapiFetch.slice(catchIdx)).toContain("attempt < VAPI_FETCH_TRANSIENT_RETRIES");
  });

  it("keeps the assistant-existence check a hard failure and calls stay informational", () => {
    // A missing assistant is still a real failure that alerts; recent-call
    // activity remains informational (never flips numberOk/assistantOk).
    expect(canary).toContain("Assistant ${vapiNumber.assistantId} unreachable");
    expect(canary).toContain("Check recent call activity (informational, not a hard failure)");
    expect(canary).toContain("l.numberOk || !l.assistantOk");
  });
});
