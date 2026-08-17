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
  });

  it("keeps live session owners off HeyGen and Imagine file generation", () => {
    for (const path of [
      "src/lib/video-presenter/liveavatar-service.ts",
      "src/routes/video-presenter-routes-base.ts",
      "src/pages/LiveVideoStudioPage.tsx",
      "src/components/LiveVideoPresenter.tsx",
    ]) {
      const source = read(path);
      expect(source, path).not.toContain("/v3/video-agents");
      expect(source, path).not.toContain("https://api.heygen.com");
      expect(source, path).not.toContain("https://api.liveavatar.com");
    }
    expect(read("src/lib/xai-imagine-video.ts")).toContain("IMAGINE_WATERMARK_NOT_OFFERED");
    expect(read("src/lib/xai-imagine-video.ts")).toContain("imagineVideoGenerationOffered");
  });

  it("does not let clients write consent on PATCH", () => {
    const routes = read("src/routes/video-presenter-routes-base.ts");
    const schema = routes.slice(
      routes.indexOf("const patchPresenterSchema"),
      routes.indexOf("async function ownedAgent"),
    );
    expect(schema).not.toContain("consentStatus");
    expect(schema).not.toContain("videoPresenterConsentStatus");
  });
});
