import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(__dirname, "director-routes.ts"), "utf8");

describe("Director Stitch finalize route structure", () => {
  it("binds finalize to a persisted pending Stitch session before calling Stitch", () => {
    const pendingLookup = src.indexOf("loadPendingDirectorStitchSession({");
    const finalizeCall = src.indexOf("finalizeDirectorStitchScreen({");

    expect(pendingLookup).toBeGreaterThan(-1);
    expect(finalizeCall).toBeGreaterThan(pendingLookup);
    expect(src).toContain('code: "STITCH_RENDER_SESSION_NOT_FOUND"');
  });

  it("passes render id and persisted context through finalize and persistence", () => {
    expect(src).toContain("renderId: pendingSession.renderId");
    expect(src).toContain("pendingSession.operatorMessage");
    expect(src).toContain("pendingSession.deviceType ?? deviceType");
    expect(src).toContain("deviceType: effectiveDeviceType");
    expect(src).toContain("persistDirectorStitchPreviewCompletion({");
  });
});
