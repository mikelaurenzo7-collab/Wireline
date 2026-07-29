import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatResendApiError } from "../src/lib/resend-config";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

function matchingCallEnd(source: string, openIndex: number): number {
  let depth = 0;
  let mode: "code" | "line" | "block" | "single" | "double" | "template" = "code";
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (mode === "line") {
      if (char === "\n") mode = "code";
      continue;
    }
    if (mode === "block") {
      if (char === "*" && next === "/") {
        mode = "code";
        index += 1;
      }
      continue;
    }
    if (mode !== "code") {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (
        (mode === "single" && char === "'") ||
        (mode === "double" && char === '"') ||
        (mode === "template" && char === "`")
      ) {
        mode = "code";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      mode = "line";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      mode = "block";
      index += 1;
      continue;
    }
    if (char === "'") {
      mode = "single";
      continue;
    }
    if (char === '"') {
      mode = "double";
      continue;
    }
    if (char === "`") {
      mode = "template";
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")" && --depth === 0) return index;
  }

  throw new Error(`Unbalanced log call at source offset ${openIndex}`);
}

function logCalls(source: string): string[] {
  return [...source.matchAll(/log\.(?:debug|info|warn|error)\(/g)].map((match) => {
    const start = match.index ?? 0;
    const open = start + match[0].length - 1;
    return source.slice(start, matchingCallEnd(source, open) + 1);
  });
}

describe("email observability privacy", () => {
  it("redacts recipients and bearer URLs from every email-service log call", () => {
    const source = read("src/lib/email-service.ts");
    const calls = logCalls(source);

    expect(source).toContain("function emailLogContext");
    expect(source).toContain("recipientRedacted: true");
    expect(source.match(/emailLogContext\((?:args|opts)\.to\)/g)?.length ?? 0).toBeGreaterThanOrEqual(
      13,
    );
    expect(calls.length).toBeGreaterThan(10);

    for (const call of calls) {
      expect(call).not.toMatch(/\bto:\s*(?:args|opts)\.to\b/);
      expect(call).not.toMatch(/\b(?:resetUrl|verifyUrl)\b/);
      expect(call).not.toMatch(/(?:^|\n)\s*signupUrl,\s*(?:\n|$)/);
      expect(call).not.toContain("opts.title");
    }
  });

  it("sanitizes provider error bodies before they are returned or logged", () => {
    const rawAddress = "private.person@example.com";
    const jsonError = formatResendApiError(
      422,
      JSON.stringify({ message: `Recipient ${rawAddress} is invalid.\nDo not retry.` }),
    );
    const rawError = formatResendApiError(500, `Mailbox ${rawAddress}\r\nfailed`);

    for (const detail of [jsonError, rawError]) {
      expect(detail).toContain("[redacted-email]");
      expect(detail).not.toContain(rawAddress);
      expect(detail).not.toMatch(/[\r\n]/);
    }
  });
});
