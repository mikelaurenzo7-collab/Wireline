import { describe, expect, it } from "vitest";
import { parseFigmaFileKey } from "./figma-service";

describe("figma-service", () => {
  describe("parseFigmaFileKey", () => {
    it("parses design URLs", () => {
      expect(parseFigmaFileKey("https://www.figma.com/design/AbCdEfGhIj/file-name")).toBe(
        "AbCdEfGhIj",
      );
    });

    it("parses legacy file URLs", () => {
      expect(parseFigmaFileKey("https://www.figma.com/file/XyZ1234567/My-File")).toBe("XyZ1234567");
    });

    it("accepts bare file keys", () => {
      expect(parseFigmaFileKey("AbCdEfGhIjKl")).toBe("AbCdEfGhIjKl");
    });

    it("rejects invalid input", () => {
      expect(parseFigmaFileKey("")).toBeNull();
      expect(parseFigmaFileKey("https://example.com")).toBeNull();
      expect(parseFigmaFileKey("short")).toBeNull();
    });
  });
});
