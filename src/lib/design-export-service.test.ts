import { describe, expect, it } from "vitest";
import {
  buildDesignNotesMarkdown,
  buildFigmaExportZip,
  htmlToReactTailwindComponent,
} from "./design-export-service";

describe("design-export-service", () => {
  it("builds design notes with extracted colors and fonts", () => {
    const notes = buildDesignNotesMarkdown({
      title: "Hero screen",
      deviceType: "MOBILE",
      promptSummary: "Warm onboarding",
      html: '<div style="font-family: Inter; color: #8B3FD6">Hello</div>',
    });

    expect(notes).toContain("# Hero screen");
    expect(notes).toContain("#8B3FD6");
    expect(notes).toContain("Inter");
    expect(notes).toContain("Warm onboarding");
  });

  it("wraps HTML in a React component export", () => {
    const tsx = htmlToReactTailwindComponent(
      "<html><body><p>Wireline</p></body></html>",
      "HeroScreen",
    );

    expect(tsx).toContain("export function HeroScreen()");
    expect(tsx).toContain("dangerouslySetInnerHTML");
    expect(tsx).toContain("<p>Wireline</p>");
  });

  it("packages a figma export zip with expected entries", () => {
    const zip = buildFigmaExportZip({
      title: "Landing page",
      html: Buffer.from("<html><body><p>Hi</p></body></html>", "utf8"),
      image: Buffer.from("png-bytes"),
    });

    const text = zip.toString("binary");
    expect(text).toContain("design-notes.md");
    expect(text).toContain("wireline-design.json");
    expect(text).toContain("prototype.html");
    expect(text).toContain("preview.png");
  });
});
