import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getGoogleStitchProjectId,
  hasGoogleStitchCredentials,
  parseGoogleStitchProjectId,
} from "./google-stitch-config";

function clearStitchEnv() {
  vi.stubEnv("GOOGLE_STITCH_API_KEY", "");
  vi.stubEnv("STITCH_API_KEY", "");
  vi.stubEnv("STITCH_ACCESS_TOKEN", "");
  vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");
  vi.stubEnv("GOOGLE_STITCH_PROJECT_ID", "");
  vi.stubEnv("STITCH_PROJECT_ID", "");
}

describe("google stitch config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts bare, resource, and Stitch web URL project IDs", () => {
    expect(parseGoogleStitchProjectId("8518455716666015580")).toBe("8518455716666015580");
    expect(parseGoogleStitchProjectId("projects/8518455716666015580")).toBe("8518455716666015580");
    expect(
      parseGoogleStitchProjectId("https://stitch.withgoogle.com/projects/8518455716666015580"),
    ).toBe("8518455716666015580");
  });

  it("reads GOOGLE_STITCH_PROJECT_ID before aliases", () => {
    clearStitchEnv();
    vi.stubEnv("GOOGLE_STITCH_PROJECT_ID", "projects/primary");
    vi.stubEnv("STITCH_PROJECT_ID", "secondary");
    expect(getGoogleStitchProjectId()).toBe("primary");
  });

  it("treats api key or OAuth quota project as valid SDK credentials", () => {
    clearStitchEnv();
    expect(hasGoogleStitchCredentials()).toBe(false);

    vi.stubEnv("GOOGLE_STITCH_API_KEY", "key");
    expect(hasGoogleStitchCredentials()).toBe(true);

    vi.stubEnv("GOOGLE_STITCH_API_KEY", "");
    vi.stubEnv("STITCH_API_KEY", "");
    vi.stubEnv("STITCH_ACCESS_TOKEN", "token");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "quota-project");
    expect(hasGoogleStitchCredentials()).toBe(true);
  });
});
