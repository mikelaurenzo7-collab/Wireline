import { afterEach, describe, expect, it, vi } from "vitest";

import {
  runWithWebsiteKnowledgeExtractionTimeout,
  WebsiteKnowledgeExtractionTimeoutError,
} from "../src/lib/website-knowledge-timeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("website knowledge extraction deadline", () => {
  it("passes a live abort signal and preserves successful results", async () => {
    const result = await runWithWebsiteKnowledgeExtractionTimeout(async (signal) => {
      expect(signal.aborted).toBe(false);
      return "ok";
    }, 1_000);

    expect(result).toBe("ok");
  });

  it("rejects on schedule even when the provider ignores cancellation", async () => {
    vi.useFakeTimers();
    let observedAbort = false;

    const pending = runWithWebsiteKnowledgeExtractionTimeout(
      (signal) =>
        new Promise<never>(() => {
          signal.addEventListener(
            "abort",
            () => {
              observedAbort = true;
            },
            { once: true },
          );
        }),
      1_000,
    );

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).rejects.toBeInstanceOf(WebsiteKnowledgeExtractionTimeoutError);
    expect(observedAbort).toBe(true);
  });

  it("does not rewrite genuine provider failures as timeout errors", async () => {
    const providerError = new Error("provider unavailable");

    await expect(
      runWithWebsiteKnowledgeExtractionTimeout(async () => {
        throw providerError;
      }, 1_000),
    ).rejects.toBe(providerError);
  });
});
