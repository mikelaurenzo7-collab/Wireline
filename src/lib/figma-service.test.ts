import { describe, expect, it } from "vitest";
import { FIGMA_OAUTH_SCOPES, parseFigmaFileKey } from "./figma-service";

describe("figma-service", () => {
  it("requests only OAuth scopes enabled on the Wireline Design Figma app", () => {
    const enabledOnApp = new Set([
      "current_user:read",
      "file_comments:read",
      "file_comments:write",
      "file_content:read",
      "file_metadata:read",
      "file_versions:read",
      "library_assets:read",
      "library_content:read",
      "team_library_content:read",
      "file_dev_resources:read",
      "file_dev_resources:write",
      "project_metadata:read",
      "webhooks:read",
      "webhooks:write",
    ]);
    for (const scope of FIGMA_OAUTH_SCOPES.split(",")) {
      expect(enabledOnApp.has(scope), `unexpected OAuth scope: ${scope}`).toBe(true);
    }
    expect(FIGMA_OAUTH_SCOPES).not.toContain("file_variables:read");
  });

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
