import { describe, expect, it } from "vitest";
import { extractBrandFromHtml } from "./design-brand-import";

describe("design-brand-import", () => {
  describe("extractBrandFromHtml", () => {
    it("extracts title, description, theme color, and fonts", () => {
      const html = `<!doctype html>
<html>
<head>
  <title>Acme Bowls</title>
  <meta name="description" content="Fast-casual Italian in Austin" />
  <meta name="theme-color" content="#E85D04" />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&display=swap" rel="stylesheet" />
  <style>body { font-family: "Fraunces", serif; color: #1a1a1a; }</style>
</head>
<body></body>
</html>`;

      const extract = extractBrandFromHtml(html, "https://acme.example");

      expect(extract.title).toBe("Acme Bowls");
      expect(extract.description).toBe("Fast-casual Italian in Austin");
      expect(extract.themeColor).toBe("#E85D04");
      expect(extract.colors).toContain("#E85D04");
      expect(extract.colors).toContain("#1a1a1a");
      expect(extract.fontFamilies.some((f) => f.includes("Fraunces"))).toBe(true);
    });

    it("returns empty collections for sparse pages", () => {
      const extract = extractBrandFromHtml("<html><body>Hi</body></html>", "https://example.com");
      expect(extract.colors).toEqual([]);
      expect(extract.fontFamilies).toEqual([]);
    });
  });
});
