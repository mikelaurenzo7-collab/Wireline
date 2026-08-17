import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("presenter voice security contract", () => {
  it("removes the HeyGen presenter-voice synthesis path", () => {
    expect(
      existsSync(resolve(process.cwd(), "src/lib/video-presenter/heygen-voice-service.ts")),
    ).toBe(false);
  });
});
