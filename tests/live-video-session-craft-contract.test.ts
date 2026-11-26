import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("retired presenter CSS stays out of the launch cascade", () => {
  it("deletes face/video sheets and gives compact Bot presence to product surfaces only", () => {
    const marketing = read("src/styles/wireline-marketing-surfaces.css");
    const product = read("src/styles/wireline-product-surfaces.css");
    const presence = read("src/styles/agent-presence.css");

    expect(existsSync(resolve(process.cwd(), "src/styles/agent-face.css"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/styles/video-receptionist.css"))).toBe(false);
    expect(marketing).not.toContain("agent-face.css");
    expect(marketing).not.toContain("video-receptionist.css");
    expect(marketing).not.toContain("agent-presence.css");
    expect(product).toContain('import "./agent-presence.css"');

    expect(presence).toContain("WIRELINE Bot presence");
    expect(presence).toContain(".wl-presence__frame");
    expect(presence).toContain(".wl-presence__strip");
    expect(presence).toContain(".wl-presence__chip");
    expect(presence).not.toContain(".wl-presence-live");
    expect(presence).not.toContain(".wl-agent-face");
    expect(presence).not.toContain("catalog-thumb");
    expect(presence).not.toContain("__video");
  });
});

describe("review-hardening: the fixes Codex found in the first pass", () => {
  it("binds the SMS post-send refresh to the thread that was replied to", () => {
    const sms = read("src/components/SmsThreads.tsx");
    const accepted = sms.slice(
      sms.indexOf("if (response.ok && result?.ok === true)"),
      sms.indexOf("const message = result?.reason", sms.indexOf("if (response.ok")),
    );
    expect(accepted).toContain("if (activeIdRef.current === threadId)");
    expect(accepted).toContain("fetchMessages(threadId, activeThreadFetchRef.current?.signal)");
    expect(sms).not.toContain("sentThreadController");
  });

  it("never re-dials an outbound call whose provider outcome is ambiguous", () => {
    const engine = read("src/lib/cadence-engine.ts");
    const step = engine.slice(
      engine.indexOf("async function executeStep"),
      engine.indexOf("const CADENCE_STEP_LEASE_MS"),
    );
    expect(step).not.toContain("retryable: !res.ok");
    expect(step).toContain('result: "compliance gate failed (fail-closed)", retryable: true');
    expect(step).toContain("voice control rejected");
  });
});
