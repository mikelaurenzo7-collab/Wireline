import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("auth signup enumeration timing", () => {
  it("equalizes email-taken vs create paths on signup", () => {
    const source = read("src/routes/auth-routes.ts");
    expect(source).toContain("const SIGNUP_MIN_DURATION_MS = 500;");
    expect(source).toContain("equalizedDuration(");
    expect(source).toContain("kind: \"taken\"");
    expect(source).toContain("kind: \"created\"");
    expect(source).toContain("SIGNUP_MIN_DURATION_MS");
    // Race 23505 path is already equalized inside the create work (rejection is padded).
    expect(source).toContain('pgCode === "23505"');
    expect(source).not.toMatch(
      /pgCode === "23505"[\s\S]*?equalizedDuration\(Promise\.resolve\(\),\s*SIGNUP_MIN_DURATION_MS\)/,
    );
  });
});
