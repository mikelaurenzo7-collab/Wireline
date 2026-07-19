import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { redactSensitiveText } from "../src/lib/shareable-artifact/redact";

describe("shareable-artifact PII redaction", () => {
  it("redacts payment card numbers regardless of grouping", () => {
    expect(redactSensitiveText("my card is 4242424242424242 thanks")).toBe(
      "my card is [redacted] thanks",
    );
    expect(redactSensitiveText("card: 4242-4242-4242-4242 exp 12/28")).toBe(
      "card: [redacted] exp 12/28",
    );
    expect(redactSensitiveText("number 4242 4242 4242 4242 please")).toBe(
      "number [redacted] please",
    );
    expect(redactSensitiveText("amex 378282246310005 for the deposit")).toBe(
      "amex [redacted] for the deposit",
    );
  });

  it("redacts SSNs, hyphenated or bare", () => {
    expect(redactSensitiveText("ssn is 123-45-6789 for verification")).toBe(
      "ssn is [redacted] for verification",
    );
    expect(redactSensitiveText("my number is 123456789 ok")).toBe("my number is [redacted] ok");
  });

  it("never touches US phone numbers (10 or 11 digits)", () => {
    expect(redactSensitiveText("call me back at 4155550100 anytime")).toBe(
      "call me back at 4155550100 anytime",
    );
    expect(redactSensitiveText("reach me at 14155550100 after five")).toBe(
      "reach me at 14155550100 after five",
    );
    expect(redactSensitiveText("call (415) 555-0100 please")).toBe("call (415) 555-0100 please");
  });

  it("redacts every match in a line with mixed content", () => {
    expect(redactSensitiveText("card 4242 4242 4242 4242 and ssn 123-45-6789 both here")).toBe(
      "card [redacted] and ssn [redacted] both here",
    );
  });

  it("is idempotent and null-safe", () => {
    expect(redactSensitiveText("card [redacted] on file")).toBe("card [redacted] on file");
    expect(redactSensitiveText("")).toBe("");
  });

  it("leaves ordinary appointment/summary language untouched", () => {
    const text = "Diane booked a routine cleaning for next Tuesday 10:30 AM.";
    expect(redactSensitiveText(text)).toBe(text);
  });
});

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("shareable-artifact redaction is wired at every publish choke point", () => {
  it("call recap redacts summary and transcript before they reach hero/moments/stored content", () => {
    const source = read("src/lib/shareable-artifact/publish-call-recap.ts");
    expect(source).toContain('import { redactSensitiveText } from "./redact"');
    expect(source).toContain(
      "const safeSummary = input.summary ? redactSensitiveText(input.summary)",
    );
    expect(source).toContain(
      "const safeTranscript = input.transcript\n      ? redactSensitiveText(input.transcript)",
    );
    // Every downstream consumer must use the redacted variables, not the raw input.
    expect(source).toContain("summary: safeSummary,");
    expect(source).toContain("moments: extractMoments(safeSummary)");
    expect(source).toContain("transcript: parseTranscript(safeTranscript)");
    expect(source).toContain("summary: safeSummary ?? null,");
  });

  it("weekly recap redacts top-moment heroes and follow-up descriptions", () => {
    const source = read("src/lib/scheduled-report-service.ts");
    expect(source).toContain('import { redactSensitiveText } from "./shareable-artifact/redact"');
    expect(source).toContain("hero: redactSensitiveText(");
    expect(source).toContain('description: redactSensitiveText(task.description ?? "")');
  });
});
