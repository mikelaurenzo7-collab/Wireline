import { describe, expect, it } from "vitest";
import { isLikelyStaleChunkError } from "../src/lib/chunk-recovery";

describe("stale chunk recovery", () => {
  it("detects common Vite and browser chunk-load failures", () => {
    expect(isLikelyStaleChunkError(new Error("Failed to fetch dynamically imported module"))).toBe(
      true,
    );
    expect(isLikelyStaleChunkError(new Error("ChunkLoadError: Loading chunk 123 failed"))).toBe(
      true,
    );
    expect(isLikelyStaleChunkError("Importing a module script failed.")).toBe(true);
  });

  it("does not classify ordinary render errors as stale bundles", () => {
    expect(isLikelyStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isLikelyStaleChunkError("Network request failed for /api/agents")).toBe(false);
  });
});
