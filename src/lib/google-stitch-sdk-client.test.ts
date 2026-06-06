import { describe, expect, it } from "vitest";
import {
  mapStitchError,
  projectEntityToRef,
  screenEntityToRecord,
} from "./google-stitch-sdk-helpers";
import { GoogleStitchError } from "./google-stitch-mcp-client";

describe("google stitch sdk helpers", () => {
  it("passes through GoogleStitchError", () => {
    const err = new GoogleStitchError("slow down", "RATE_LIMITED", true);
    expect(mapStitchError(err)).toBe(err);
  });

  it("maps stitch-shaped errors to GoogleStitchError", () => {
    const err = Object.assign(new Error("slow down"), {
      code: "RATE_LIMITED",
      recoverable: true,
    });
    const mapped = mapStitchError(err);
    expect(mapped).toBeInstanceOf(GoogleStitchError);
    expect(mapped.code).toBe("RATE_LIMITED");
    expect(mapped.recoverable).toBe(true);
  });

  it("maps generic errors to GoogleStitchError", () => {
    const mapped = mapStitchError(new Error("boom"));
    expect(mapped).toBeInstanceOf(GoogleStitchError);
    expect(mapped.message).toBe("boom");
    expect(mapped.code).toBe("UNKNOWN_ERROR");
  });

  it("projects screen entities into parser-friendly records", () => {
    const record = screenEntityToRecord({
      screenId: "98b50e2ddc9943efb387052637738f61",
      projectId: "4044680601076201931",
      data: {
        screenshot: { downloadUrl: "https://storage.googleapis.com/a.png" },
      },
    });
    expect(record.screenId).toBe("98b50e2ddc9943efb387052637738f61");
    expect(record.projectId).toBe("4044680601076201931");
    expect(record.screenshot).toBeDefined();
  });

  it("projects project entities into stitch project refs", () => {
    const ref = projectEntityToRef({
      projectId: "222",
      data: { title: "Wireline", projectType: "TEXT_TO_UI_PRO" },
    });
    expect(ref.projectId).toBe("222");
    expect(ref.title).toBe("Wireline");
    expect(ref.projectType).toBe("TEXT_TO_UI_PRO");
  });
});
