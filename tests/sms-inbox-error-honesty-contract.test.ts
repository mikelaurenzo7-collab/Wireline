import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("sms inbox error honesty", () => {
  it("does not mask thread/message failures as empty success", () => {
    const source = read("src/routes/sms-routes.ts");
    expect(source).toContain("rethrowIfAppError");
    expect(source).toContain('throw AppError.fromHttpStatus(500, "Failed to load SMS threads")');
    expect(source).toContain('throw AppError.fromHttpStatus(500, "Failed to load SMS messages")');
    expect(source).toContain('throw AppError.fromHttpStatus(500, "Failed to mark SMS thread read")');
    expect(source).toContain("evaluateOutboundDialGate");
    expect(source).not.toContain('res.json({ threads: [] })');
    expect(source).not.toContain('res.json({ messages: [] })');
    expect(source).not.toContain("res.json({ ok: false })");
    expect(source).not.toContain("migration may be pending");
  });
});
