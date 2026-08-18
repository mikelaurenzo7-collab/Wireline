import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("native xAI/Twilio final integration gate", () => {
  it("loads the deliberately gated team roster only once per Settings mount", () => {
    const source = read("src/components/AdminSettings.tsx");
    expect(source.match(/authFetch\("\/api\/team"\)/g) || []).toHaveLength(1);
    expect(source).toContain("SHARED_WORKSPACES_NOT_CERTIFIED");
  });

  it("keeps normal desktop and accessible mobile navigation on the consolidated public site", () => {
    const source = read("src/components/marketing/PrecisionPublicHeader.tsx");
    expect(source).toContain('aria-label="Site"');
    expect(source).toContain('aria-label={open ? "Close navigation" : "Open navigation"}');
    expect(source).toContain('id="wireline-mobile-navigation"');
    expect(source).toContain('aria-controls="wireline-mobile-navigation"');
  });

  it("keeps connected carrier callbacks and transferred PSTN legs non-destructive", () => {
    const outbound = read("src/routes/xai-outbound-routes.ts");
    const sip = read("src/lib/voice/xai-sip-session.ts");

    expect(outbound).toContain("carrier_terminal_after_bridge");
    expect(outbound).toContain("!neverBridgedNativeVoice(nativeVoice)");
    expect(sip).toContain('ws.close(1000, "Wireline transferred")');

    const notifierStart = sip.indexOf("const notifyTransferred = () => {");
    const notifierEnd = sip.indexOf("liveSipSessions.set", notifierStart);
    expect(sip.slice(notifierStart, notifierEnd)).not.toContain("hangupXAISipCall");
  });
});
