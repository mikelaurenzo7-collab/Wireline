import { describe, expect, it } from "vitest";
import {
  extractDirectorHtmlPrototype,
  inferDeviceTypeFromHtml,
  inferPrototypeTitle,
  normalizeDirectorHtmlDocument,
  resolveDesignPreviewDeviceType,
  stripHtmlPrototypeFromReply,
} from "./director-html-prototype";

describe("director-html-prototype", () => {
  it("extracts html from fenced blocks", () => {
    const html = extractDirectorHtmlPrototype(
      "Here is the page:\n```html\n<!doctype html><html><body>Hi</body></html>\n```",
    );
    expect(html).toContain("<!doctype html>");
  });

  it("wraps fragment documents", () => {
    const wrapped = normalizeDirectorHtmlDocument("<main>Hello</main>");
    expect(wrapped).toContain("<html");
    expect(wrapped).toContain("<main>Hello</main>");
  });

  it("infers title from operator message", () => {
    expect(inferPrototypeTitle("Brightline home services landing page", undefined)).toContain(
      "Brightline",
    );
  });

  it("strips html fences from chat copy when preview carries the document", () => {
    const reply = "Here is your page.\n\n```html\n<!doctype html><html></html>\n```\n\nNext steps.";
    expect(stripHtmlPrototypeFromReply(reply)).toBe("Here is your page.\n\nNext steps.");
  });

  it("does not infer mobile from default kit hero width", () => {
    const html = "<style>.wl-hero{max-width:28rem;min-height:70dvh}</style>";
    expect(inferDeviceTypeFromHtml(html)).toBeNull();
  });

  it("infers desktop frame from wide layout markup", () => {
    const html =
      "<style>main{max-width:1200px}@media(min-width:64rem){.grid{grid-template-columns:repeat(3,1fr)}}</style>";
    expect(inferDeviceTypeFromHtml(html)).toBe("DESKTOP");
  });

  it("defaults ambiguous website prompts to desktop preview frame", () => {
    expect(
      resolveDesignPreviewDeviceType({
        operatorMessage: "Brightline home services hero section",
        html: "<main>Hello</main>",
      }),
    ).toBe("DESKTOP");
    expect(
      resolveDesignPreviewDeviceType({
        operatorMessage: "Design a mobile hero for Brightline",
        html: "<main>Hello</main>",
      }),
    ).toBe("MOBILE");
  });
});
