import { describe, expect, it } from "vitest";
import {
  buildHeroImaginePrompt,
  estimateDataUrlBytes,
  injectImagineAssetsIntoHtml,
} from "./director-design-imagine";

describe("director-design-imagine", () => {
  it("uses wide hero prompt for desktop landing pages", () => {
    const prompt = buildHeroImaginePrompt({
      operatorMessage: "Design a landing page for Brightline",
      designBriefMarkdown: "# Brief",
      deviceType: "DESKTOP",
    });
    expect(prompt).toContain("desktop web hero");
    expect(prompt).toContain("16:9");
  });

  it("uses mobile hero prompt when device is mobile", () => {
    const prompt = buildHeroImaginePrompt({
      operatorMessage: "Design a mobile hero",
      designBriefMarkdown: "# Brief",
      deviceType: "MOBILE",
    });
    expect(prompt).toContain("mobile hero");
    expect(prompt).toContain("9:16");
  });

  it("injects desktop-width hero content when device is desktop", () => {
    const dataUrl = "data:image/png;base64," + "A".repeat(120);
    const html =
      '<!doctype html><html><head><style></style></head><body><header class="wl-hero"><h1>Hi</h1></header></body></html>';
    const out = injectImagineAssetsIntoHtml(
      html,
      [
        {
          role: "hero_background",
          dataUrl,
          cssVar: "--wl-hero-photo",
          prompt: "test",
        },
      ],
      "DESKTOP",
    );
    expect(out).toContain("max-width: 48rem");
    expect(out).toContain(dataUrl.slice(0, 40));
  });

  it("estimates data URL byte size", () => {
    const b64 = "AAAA";
    expect(estimateDataUrlBytes(`data:image/png;base64,${b64}`)).toBe(3);
  });
});
