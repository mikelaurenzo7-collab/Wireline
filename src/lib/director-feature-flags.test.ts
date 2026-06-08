import { afterEach, describe, expect, it } from "vitest";
import { loadDirectorFeatureFlags } from "./director-feature-flags";

describe("loadDirectorFeatureFlags", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("mirrors designStudio and stitchMedia from DIRECTOR_DESIGN_STUDIO_ENABLED", () => {
    process.env.DIRECTOR_DESIGN_STUDIO_ENABLED = "false";
    delete process.env.DIRECTOR_STITCH_MEDIA_ENABLED;
    const flags = loadDirectorFeatureFlags();
    expect(flags.designStudio).toBe(false);
    expect(flags.stitchMedia).toBe(false);
  });

  it("reads legacy DIRECTOR_STITCH_MEDIA_ENABLED when design flag is unset", () => {
    delete process.env.DIRECTOR_DESIGN_STUDIO_ENABLED;
    process.env.DIRECTOR_STITCH_MEDIA_ENABLED = "true";
    const flags = loadDirectorFeatureFlags();
    expect(flags.designStudio).toBe(true);
    expect(flags.stitchMedia).toBe(true);
  });
});
