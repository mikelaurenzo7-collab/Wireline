import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const OPENAI_SIP_PIPELINE_FAILURES = [
  "openai_response",
  "openai_realtime",
  "startup",
  "heartbeat",
] as const;

describe("OpenAI SIP reliability classification", () => {
  it("counts every native SIP failure class as a pipeline failure", () => {
    const capture = read("src/lib/call-reliability-capture.ts");
    const failureSet = capture.slice(
      capture.indexOf("const PIPELINE_FAILURE_VALUES"),
      capture.indexOf("export function isPipelineFailure"),
    );

    for (const failure of OPENAI_SIP_PIPELINE_FAILURES) {
      expect(failureSet).toContain(`\"${failure}\"`);
    }
  });

  it("keeps the classifier aligned with the OpenAI SIP session vocabulary", () => {
    const session = read("src/lib/voice/openai-sip-session.ts");
    for (const failure of OPENAI_SIP_PIPELINE_FAILURES) {
      expect(session).toContain(failure);
    }
  });
});
