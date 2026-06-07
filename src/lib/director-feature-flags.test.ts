import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDirectorFeatureFlags } from "./director-feature-flags";

describe("loadDirectorFeatureFlags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables Stitch by default when a Stitch API key is configured", () => {
    vi.stubEnv("GOOGLE_STITCH_API_KEY", "key");
    vi.stubEnv("DIRECTOR_STITCH_MEDIA_ENABLED", undefined);
    expect(loadDirectorFeatureFlags().stitchMedia).toBe(true);
  });

  it("honors explicit false for Stitch media", () => {
    vi.stubEnv("GOOGLE_STITCH_API_KEY", "key");
    vi.stubEnv("DIRECTOR_STITCH_MEDIA_ENABLED", "false");
    expect(loadDirectorFeatureFlags().stitchMedia).toBe(false);
  });

  it("falls back to configured default for non-boolean Vercel flag values", () => {
    vi.stubEnv("GOOGLE_STITCH_API_KEY", "key");
    vi.stubEnv("DIRECTOR_STITCH_MEDIA_ENABLED", "configured");
    expect(loadDirectorFeatureFlags().stitchMedia).toBe(true);
  });
});
