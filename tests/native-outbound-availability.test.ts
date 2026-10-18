import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NATIVE_OUTBOUND_UNAVAILABLE } from "../src/lib/native-outbound-availability";

afterEach(() => vi.unstubAllEnvs());

describe("native outbound independent closure", () => {
  it.each(["true", "false", ""])(
    "stays unavailable when general outbound activation is %s",
    (enabled) => {
      vi.stubEnv("BOTBOUND_GENERAL_OUTBOUND_ENABLED", enabled);
      expect(NATIVE_OUTBOUND_UNAVAILABLE).toEqual({
        code: "NATIVE_OUTBOUND_UNAVAILABLE",
        error: expect.stringContaining("Open BotBound in your browser"),
        web_url: "https://botbound.app/phone?tab=outbound",
      });
      expect(Object.isFrozen(NATIVE_OUTBOUND_UNAVAILABLE)).toBe(true);
    },
  );

  it("returns authenticated unavailable before any mutation and preserves separate native inbound routes", () => {
    const source = readFileSync("src/routes/mobile-routes.ts", "utf8");
    const route = source.slice(
      source.indexOf('"/api/mobile/calls/outbound"'),
      source.indexOf("// ── GET /api/mobile/calls/active"),
    );
    expect(route).toMatch(/authenticateUser,\s*mobileSensitiveRateLimiter,/);
    expect(route).toContain("res.status(503).json(NATIVE_OUTBOUND_UNAVAILABLE)");
    expect(route).not.toMatch(
      /validate\(|\.insert\(|\.update\(|\.delete\(|outboundVoiceGuard|BOTBOUND_GENERAL_OUTBOUND_ENABLED/,
    );
    expect(source).not.toMatch(/placeOutboundCall|outboundDialReservations|mobileDialSchema/);
    expect(source).toContain('"/api/mobile/calls/active"');
    expect(source).toContain('"/api/mobile/calls/:callId/handoff"');
  });
});
