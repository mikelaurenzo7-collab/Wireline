import { describe, expect, it } from "vitest";
import { extractStitchProjectId, extractStitchScreens } from "./google-stitch-mcp-client";

describe("google stitch mcp parsing", () => {
  it("extracts project and screen ids from nested payloads", () => {
    const payload = {
      screens: [
        {
          screenId: "9876543210",
          projectId: "projects/1234567890",
          screenshot: { downloadUrl: "https://storage.googleapis.com/x.png" },
          htmlCode: { downloadUrl: "https://storage.googleapis.com/x.html" },
        },
      ],
    };
    expect(extractStitchProjectId(payload)).toBe("1234567890");
    expect(extractStitchScreens(payload)).toHaveLength(1);
    expect(extractStitchScreens(payload)[0]?.screenId).toBe("9876543210");
  });
});
