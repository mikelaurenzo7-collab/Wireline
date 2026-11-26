import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("HeyGen and LiveAvatar talking-head paths are gone", () => {
  it("deletes HeyGen clip and voice services", () => {
    expect(
      existsSync(resolve(process.cwd(), "src/lib/video-presenter/heygen-presence-clips.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(process.cwd(), "src/lib/video-presenter/heygen-voice-service.ts")),
    ).toBe(false);
    expect(existsSync(resolve(process.cwd(), "scripts/patch-liveavatar-sdk.mjs"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/lib/xai-imagine-video.ts"))).toBe(false);
  });

  it("keeps the remaining presenter service off HeyGen and Imagine file generation", () => {
    const source = read("src/lib/video-presenter/liveavatar-service.ts");
    expect(source).not.toContain("/v3/video-agents");
    expect(source).not.toContain("https://api.heygen.com");
    expect(source).not.toContain("https://api.liveavatar.com");
  });
});
