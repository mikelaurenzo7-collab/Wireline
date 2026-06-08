import { describe, expect, it } from "vitest";
import {
  extractDirectorHtmlPrototype,
  inferPrototypeTitle,
  normalizeDirectorHtmlDocument,
  stripHtmlPrototypeFromReply,
} from "./director-html-prototype";

describe("director-html-prototype", () => {
  it("extracts html from fenced blocks", () => {
    const html = extractDirectorHtmlPrototype(
      'Here is the page:\n```html\n<!doctype html><html><body>Hi</body></html>\n```',
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
});
