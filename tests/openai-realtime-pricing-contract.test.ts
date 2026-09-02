import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  OPENAI_REALTIME_COST_TRUNCATION,
  OPENAI_REALTIME_FIVE_MINUTE_AUDIO_FLOOR_USD,
  OPENAI_REALTIME_FULL_DUPLEX_AUDIO_USD_PER_MINUTE,
  OPENAI_REALTIME_SESSION_MINIMUM_RESERVE_USD,
  resolveOpenAIRealtimeSessionReserveUsd,
} from "../src/lib/voice/openai-realtime-pricing";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("gpt-realtime-2.1 admission-reserve contract", () => {
  it("derives a conservative five-minute minimum from official audio rates", () => {
    expect(OPENAI_REALTIME_FULL_DUPLEX_AUDIO_USD_PER_MINUTE).toBeCloseTo(0.096, 8);
    expect(OPENAI_REALTIME_FIVE_MINUTE_AUDIO_FLOOR_USD).toBeCloseTo(0.48, 8);
    expect(OPENAI_REALTIME_SESSION_MINIMUM_RESERVE_USD).toBe(1);
  });

  it("uses the safe fallback and rejects explicit under-reservation", () => {
    expect(resolveOpenAIRealtimeSessionReserveUsd(undefined)).toBe(1);
    expect(resolveOpenAIRealtimeSessionReserveUsd("1.25")).toBe(1.25);
    expect(() => resolveOpenAIRealtimeSessionReserveUsd("0.30")).toThrow(/at least \$1\.00/);
    expect(() => resolveOpenAIRealtimeSessionReserveUsd("not-money")).toThrow(/at least \$1\.00/);
  });

  it("applies bounded retention-ratio truncation to every account-bound browser session", () => {
    expect(OPENAI_REALTIME_COST_TRUNCATION).toEqual({
      type: "retention_ratio",
      retention_ratio: 0.8,
      token_limits: { post_instructions: 8_000 },
    });
    for (const path of [
      "src/lib/voice/openai-realtime-service.ts",
      "src/lib/voice/openai-live-agent-service.ts",
    ]) {
      expect(read(path), path).toContain("OPENAI_REALTIME_COST_TRUNCATION");
    }
  });

  it("keeps legacy public voice endpoints outside provider billing entirely", () => {
    const routes = read("src/routes/marketing-runtime-routes.ts");
    expect(routes).toContain("res.status(410).json");
    expect(routes).not.toMatch(
      /createServerManagedOpenAIRealtimeCall|resolveOpenAIRealtimeSessionReserveUsd|reserve/i,
    );
  });

  it("documents exact-source previous-key drain slots", () => {
    const runbook = read("docs/OPENAI_REALTIME_OPERATIONS.md");
    const envValidator = read("src/lib/env-validator.ts");
    expect(runbook).toContain("OPENAI_API_KEY_PREVIOUS");
    expect(runbook).toContain("OPENAI_API_KEY_CHATKIT_PREVIOUS");
    expect(runbook).toContain("at least 15 minutes");
    expect(runbook).toContain("status is distinct from 'done'");
    expect(envValidator).toContain('name: "OPENAI_API_KEY_PREVIOUS"');
    expect(envValidator).toContain('name: "OPENAI_API_KEY_CHATKIT_PREVIOUS"');
  });
});
