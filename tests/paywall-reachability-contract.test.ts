import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

// A 402 that does not open the checkout modal is a paywall with nothing to
// click: the user is told to upgrade and given no way to do it. That was true
// of every 402 in the app except the ones the trial-gate middleware emitted,
// because the client filtered on a hand-curated allowlist that had drifted.
describe("every paywall is clickable", () => {
  const apiBase = read("src/lib/api-base.ts");

  it("dispatches the gate event for any 402, not an allowlisted subset", () => {
    const sniffer = apiBase.slice(
      apiBase.indexOf("async function maybeDispatchTrialGateEvent"),
      apiBase.indexOf("export const AUTH_SESSION_EXPIRED_EVENT"),
    );
    // Scoped to 402 and nothing narrower.
    expect(sniffer).toContain("if (response.status !== 402) return;");
    expect(sniffer).toContain("window.dispatchEvent");
    // No code-based early return may gate the dispatch.
    expect(sniffer).not.toMatch(/if \(!TRIAL_GATE_CODES[\s\S]*?\) return;/);
    expect(sniffer).not.toMatch(/TRIAL_GATE_CODES\.has\(/);
  });

  it("gives 402 a real default code instead of the generic ERROR", () => {
    // AppError.fromHttpStatus falls back to "ERROR" for unmapped statuses, so
    // the agent-cap 402 arrived with a code that meant nothing to the client.
    const apiError = read("src/lib/api-error.ts");
    expect(apiError).toMatch(/402:\s*"SUBSCRIPTION_REQUIRED"/);
  });

  it("renders a usable dialog for codes it has no bespoke copy for", () => {
    // The modal's default branch must carry the server's own message through,
    // otherwise widening the dispatch would just show an empty dialog.
    const modal = read("src/components/TrialGateModal.tsx");
    const headline = modal.slice(
      modal.indexOf("function headlineForCode("),
      modal.indexOf("type ResendOutcome"),
    );
    expect(headline).toContain("default:");
    expect(headline).toMatch(/default:[\s\S]*?detail\.error/);
  });

  it("covers the paywall codes the app actually emits", () => {
    // Enumerated from source so a new 402 shows up here rather than silently
    // becoming a dead end. Each must be reachable through the widened
    // dispatch; none may depend on being added to a client-side list.
    const emitted = new Set<string>();
    for (const file of walk("src/routes").concat(walk("src/lib"))) {
      const src = read(file);
      for (const m of src.matchAll(/status\(402\)\s*\.json\(\{\s*\n?\s*code:\s*"([A-Z_]+)"/g)) {
        emitted.add(m[1]);
      }
    }
    // The four explicit ones that were all previously dropped.
    for (const code of [
      "AGENT_CAPACITY_REACHED",
      "SPEND_CAP_REACHED",
      "LIVE_PLAN_REQUIRED",
      "LIVE_VIDEO_BASE_PLAN_REQUIRED",
    ]) {
      expect(emitted, `${code} should still be emitted as a 402`).toContain(code);
    }
    // And none of them is in the documented-copy list, which is exactly why
    // the allowlist could not be the gate.
    const documented = new Set(
      Array.from(
        apiBase
          .slice(apiBase.indexOf("export const TRIAL_GATE_CODES"))
          .slice(0, 400)
          .matchAll(/"([A-Z_]+)"/g),
        (m) => m[1],
      ),
    );
    for (const code of emitted) {
      if (documented.has(code)) continue;
      // Unlisted codes are fine — they must simply not be filtered out.
      expect(documented.has(code)).toBe(false);
    }
  });
});
