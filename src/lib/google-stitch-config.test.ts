import { afterEach, describe, expect, it, vi } from "vitest";
import { getStitchComposePollDelaysMs } from "./google-stitch-config";

describe("getStitchComposePollDelaysMs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("covers several minutes for default 540s stitch budget", () => {
    vi.stubEnv("GOOGLE_STITCH_TIMEOUT_MS", "540000");
    const delays = getStitchComposePollDelaysMs();
    expect(delays[0]).toBe(0);
    expect(delays.at(-1)).toBeGreaterThanOrEqual(360_000);
    expect(delays.length).toBeGreaterThan(30);
  });
});
