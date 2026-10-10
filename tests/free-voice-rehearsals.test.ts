import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-router", () => ({ Link: "a" }));

import { voiceRehearsalsLeftCopy } from "../src/components/RoleplaySandbox";
import {
  OPENAI_FREE_REHEARSAL_SECONDS,
  OPENAI_REALTIME_SESSION_MINIMUM_RESERVE_USD,
  realtimeReserveForWindowUsd,
} from "../src/lib/voice/openai-realtime-pricing";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("free voice rehearsals", () => {
  it("reserves for the shorter session at the same per-second rate", () => {
    expect(OPENAI_FREE_REHEARSAL_SECONDS).toBe(120);
    expect(OPENAI_REALTIME_SESSION_MINIMUM_RESERVE_USD).toBe(1);
    // Two of the five minutes, rounded up to the next quarter.
    expect(realtimeReserveForWindowUsd(1, 120)).toBe(0.5);
    expect(realtimeReserveForWindowUsd(1, 300)).toBe(1);
    expect(realtimeReserveForWindowUsd(1, 60)).toBe(0.25);
    expect(realtimeReserveForWindowUsd(1, 1)).toBe(0.25);
    // A $1.50 allowance now covers three voice tests instead of one.
    expect(Math.floor(1.5 / realtimeReserveForWindowUsd(1, 120))).toBe(3);
  });

  it("tells the owner how many voice rehearsals are left", () => {
    expect(
      voiceRehearsalsLeftCopy({ voice_rehearsals_remaining: 3, voice_rehearsal_seconds: 120 }),
    ).toBe("3 voice rehearsals left this month (2 minutes each).");
    expect(
      voiceRehearsalsLeftCopy({ voice_rehearsals_remaining: 1, voice_rehearsal_seconds: 120 }),
    ).toBe("1 voice rehearsal left this month (2 minutes each).");
    expect(voiceRehearsalsLeftCopy({ voice_rehearsals_remaining: 0 })).toBe(
      "Voice rehearsals are used for this month. Text rehearsals are still available.",
    );
    expect(voiceRehearsalsLeftCopy({ voice_rehearsals_remaining: null })).toBeNull();
  });

  it("mints the shorter session only for Free Builder", () => {
    const route = read("src/routes/live-voice-routes.ts");
    expect(route).toMatch(/subscriptionPlanToTier\([^;]*\)\s*===\s*"free";/);
    expect(route).toContain(
      "const windowSeconds = freeBuilder ? OPENAI_FREE_REHEARSAL_SECONDS : undefined;",
    );
    expect(route).toContain("maxDurationSeconds: windowSeconds,");
    const service = read("src/lib/voice/openai-live-agent-service.ts");
    expect(service).toContain("input.maxDurationSeconds ?? OPENAI_LIVE_VOICE_MAX_SECONDS,");
  });
});
