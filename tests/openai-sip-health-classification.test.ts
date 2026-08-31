import { describe, expect, it } from "vitest";

import { isPipelineFailure } from "../src/lib/call-reliability-capture";

describe("OpenAI SIP health classifications", () => {
  it.each(["openai_response", "openai_realtime", "startup", "heartbeat"])(
    "counts %s as a pipeline failure",
    (classification) => {
      expect(isPipelineFailure(classification)).toBe(true);
    },
  );

  it("does not turn clean or absent classifications into failures", () => {
    expect(isPipelineFailure(null)).toBe(false);
    expect(isPipelineFailure("completed")).toBe(false);
  });
});
