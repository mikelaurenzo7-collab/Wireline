import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatResendApiError } from "../src/lib/resend-config";
import { getErrorMessage, sanitizeErrorMessage } from "../src/lib/server-utils";

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
    expect(
      source.match(/emailLogContext\((?:args|opts)\.to\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(13);
    expect(calls.length).toBeGreaterThan(10);

    for (const call of calls) {
      expect(call).not.toMatch(/\bto:\s*(?:args|opts)\.to\b/);
      expect(call).not.toMatch(/\b(?:resetUrl|verifyUrl)\b/);
      expect(call).not.toMatch(/(?:^|\n)\s*signupUrl,\s*(?:\n|$)/);
      expect(call).not.toContain("opts.title");
    }
  });

  it("redacts bound SQL params and direct identifiers from shared error messages", () => {
    const userId = "385cc38e-3086-4c9a-a5b2-4d5925c88551";
    const email = "private.person@example.com";
    const secret = "never-log-this-value";

    const queryError = getErrorMessage(
      new Error(
        `Failed query: select count(*) from "wireline_agents" where "user_id" = $1\nparams: ${userId},${email}`,
      ),
    );
    expect(queryError).toContain("Failed query:");
    expect(queryError).toContain("params: [redacted-params]");
    expect(queryError).not.toContain(userId);
    expect(queryError).not.toContain(email);

    const providerError = sanitizeErrorMessage(
      `Recipient ${email}; actor ${userId}; Authorization Bearer ${secret}; https://vendor.invalid/callback?token=${secret}`,
    );
    expect(providerError).toContain("[redacted-email]");
    expect(providerError).toContain("[redacted-id]");
    expect(providerError).toContain("Bearer [REDACTED]");
    expect(providerError).toContain("token=[REDACTED]");
    expect(providerError).not.toContain(secret);

    const bounded = getErrorMessage("x".repeat(3_000));
    expect(bounded).toHaveLength(2_012);
    expect(bounded.endsWith("…[truncated]")).toBe(true);
  });

  it("stays linear on hostile error text instead of stalling the event loop", () => {
    // Redaction runs on every error path over text this process does not
    // control. Unbounded `+` quantifiers backtrack quadratically against a long
    // run of address-shaped characters that never reaches an `@` — a 1 MB
    // string took ~19 minutes on the unbounded pattern, which stalls the single
    // Node event loop for every other request in the instance.
    const hostile = "a.b.c".repeat(400_000); // 2 MB, no "@" anywhere
    const started = Date.now();
    const sanitized = sanitizeErrorMessage(hostile);
    const elapsedMs = Date.now() - started;

    expect(elapsedMs).toBeLessThan(1_000);
    expect(sanitized).toHaveLength(2_012);
    expect(sanitized.endsWith("…[truncated]")).toBe(true);

    const hostileProviderBody = `${"x.y.z".repeat(400_000)} rejected`;
    const providerStarted = Date.now();
    const providerDetail = formatResendApiError(500, hostileProviderBody);
    expect(Date.now() - providerStarted).toBeLessThan(1_000);
    expect(providerDetail.length).toBeLessThanOrEqual(400);
  });

  it("still redacts addresses at the boundaries the bounded pattern allows", () => {
    const local = "a".repeat(64);
    expect(sanitizeErrorMessage(`from ${local}@example.com now`)).toContain("[redacted-email]");
    expect(sanitizeErrorMessage("Jane.Doe+tag@sub.example.co.uk")).toBe("[redacted-email]");
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
