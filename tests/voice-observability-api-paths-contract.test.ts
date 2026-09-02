import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("voice observability production paths", () => {
  it("keeps voice reliability authenticated and retires the public demo-line probe", () => {
    const routes = read("src/routes/voice-observability-routes.ts");

    expect(routes).not.toContain("/api/health/voice-status");
    expect(routes).not.toContain("voiceStatusPublicRateLimit");
    expect(routes).toMatch(
      /router\.get\(\s*"\/api\/insights\/voice-reliability",\s*authenticateUser,\s*requirePermission\("insights\.read"\)/,
    );
    expect(routes).not.toContain('router.post("/api/voice/metrics"');
    expect(routes).not.toContain('router.post("/voice/metrics"');
  });

  it("does not allow LiveAvatar or LiveKit connect-src after talking-head retirement", () => {
    const csp = read("src/lib/csp.ts");
    expect(csp).not.toContain("https://api.liveavatar.com");
    expect(csp).not.toContain("https://*.livekit.cloud");
    expect(csp).not.toContain("wss://*.livekit.cloud");
    expect(csp).not.toContain("https://api.x.ai");
    expect(csp).not.toContain("wss://api.x.ai");
    expect(csp).not.toContain("https://api.openai.com");
  });
});
