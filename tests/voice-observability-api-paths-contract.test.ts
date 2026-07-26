import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("voice observability production paths", () => {
  it("registers voice metrics and voice-status under /api so Vercel rewrites reach Express", () => {
    const routes = read("src/routes/voice-observability-routes.ts");
    expect(routes).toContain('router.post("/api/voice/metrics"');
    // Tolerate a wrapped multi-line registration (path on its own line when the
    // route carries extra middleware) — the invariant is the /api prefix.
    expect(routes).toMatch(/router\.get\(\s*"\/api\/health\/voice-status"/);
    expect(routes).not.toContain('router.post("/voice/metrics"');
    expect(routes).not.toContain('router.get("/health/voice-status"');
  });

  it("allows LiveAvatar and LiveKit connect-src for browser live video", () => {
    const csp = read("src/lib/csp.ts");
    expect(csp).toContain("https://api.liveavatar.com");
    expect(csp).toContain("https://*.livekit.cloud");
    expect(csp).toContain("wss://*.livekit.cloud");
  });
});
