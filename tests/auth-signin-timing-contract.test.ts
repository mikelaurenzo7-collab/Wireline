import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const source = read("src/routes/auth-routes.ts");

describe("signin timing-oracle equalization", () => {
  it("wraps authService.signIn in the same floor-duration equalizer used by forgot-password", () => {
    // authService.signIn returns null fast for an unregistered email
    // (no scrypt) but only after running scrypt for a registered email
    // with the wrong password — without equalizing, that gap is a
    // measurable account-enumeration timing oracle.
    expect(source).toContain(
      "const result = await equalizedDuration(\n        authService.signIn(email, password),\n        SIGNIN_MIN_DURATION_MS,\n      );",
    );
    expect(source).toContain("const SIGNIN_MIN_DURATION_MS = 400;");
  });

  it("keeps the forgot-password floor independently tunable at 1000ms", () => {
    expect(source).toContain("const FORGOT_PASSWORD_MIN_DURATION_MS = 1000;");
    expect(source).toContain(
      "authService.createPasswordResetToken(email, req.ip),\n        FORGOT_PASSWORD_MIN_DURATION_MS,",
    );
  });

  it("equalizedDuration takes an explicit floor so call sites can't silently share the wrong constant", () => {
    expect(source).toContain(
      "async function equalizedDuration<T>(promise: Promise<T>, minMs: number): Promise<T>",
    );
  });
});
