import { describe, expect, it } from "vitest";
import { isIntentionalCaptureAbort } from "../scripts/lib/visual-capture-diagnostics.mjs";

const beacon = "https://plausible.io/js/script.tagged-events.js";
const resourceError = "Failed to load resource: net::ERR_FAILED";

describe("intentional visual capture network aborts", () => {
  it("recognizes the resource error for an explicitly aborted URL", () => {
    expect(isIntentionalCaptureAbort(resourceError, beacon, new Set([beacon]))).toBe(true);
  });

  it("retains failures when that exact request was not aborted by this capture", () => {
    expect(isIntentionalCaptureAbort(resourceError, beacon, new Set())).toBe(false);
    expect(
      isIntentionalCaptureAbort(resourceError, `${beacon}?other=1`, new Set([beacon])),
    ).toBe(false);
    expect(isIntentionalCaptureAbort(resourceError, beacon, undefined)).toBe(false);
  });

  it("retains application failures, unknown sources, and ordinary script exceptions", () => {
    const aborted = new Set([beacon]);
    expect(
      isIntentionalCaptureAbort(resourceError, "https://botbound.app/assets/app.js", aborted),
    ).toBe(false);
    expect(isIntentionalCaptureAbort(resourceError, "", aborted)).toBe(false);
    expect(isIntentionalCaptureAbort("Uncaught TypeError: failed", beacon, aborted)).toBe(false);
    expect(
      isIntentionalCaptureAbort(
        "Failed to load resource: net::ERR_CERT_AUTHORITY_INVALID",
        beacon,
        aborted,
      ),
    ).toBe(false);
  });
});
