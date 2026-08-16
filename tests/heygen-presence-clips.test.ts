import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertPresenceClipMintNotOffered,
  describePresenceClipCapability,
  presenceClipMintOffered,
  presenceClipSpendRequested,
  presenceClipsConfigured,
} from "../src/lib/video-presenter/heygen-presence-clips";

describe("HeyGen presence clips stay fail-closed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats a missing key as unconfigured", () => {
    vi.stubEnv("HEYGEN_API_KEY", "");
    vi.stubEnv("WIRELINE_PRESENCE_CLIPS_ENABLED", "");
    expect(presenceClipsConfigured()).toBe(false);
    expect(presenceClipSpendRequested()).toBe(false);
    expect(presenceClipMintOffered()).toBe(false);
  });

  it("does not offer minting even when the key and operator flag are set", () => {
    vi.stubEnv("HEYGEN_API_KEY", "hg_test_key");
    vi.stubEnv("WIRELINE_PRESENCE_CLIPS_ENABLED", "true");
    expect(presenceClipsConfigured()).toBe(true);
    expect(presenceClipSpendRequested()).toBe(true);
    expect(presenceClipMintOffered()).toBe(false);
    expect(describePresenceClipCapability()).toEqual({
      configured: true,
      spendRequested: true,
      mintOffered: false,
    });
  });

  it("refuses minting with a customer-safe error", () => {
    expect(() => assertPresenceClipMintNotOffered()).toThrow(
      /Presence clips are not available yet/,
    );
  });
});
