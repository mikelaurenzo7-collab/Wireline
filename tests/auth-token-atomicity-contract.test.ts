import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

function functionBlock(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThan(-1);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("account-recovery tokens are claimed atomically", () => {
  const service = read("src/lib/auth-service.ts");

  it("claims an email-verification token conditionally before updating the user", () => {
    const block = functionBlock(
      service,
      "async completeEmailVerification",
      "async createPasswordResetToken",
    );
    const claim = block.indexOf(".update(schema.emailVerificationTokens)");
    const userWrite = block.indexOf(".update(schema.users)");

    expect(block).toContain("drizzle.transaction");
    expect(block).toContain("gte(schema.emailVerificationTokens.expiresAt, now)");
    expect(block).toContain("isNull(schema.emailVerificationTokens.usedAt)");
    expect(block).toContain(".returning({ userId: schema.emailVerificationTokens.userId })");
    expect(claim).toBeGreaterThan(-1);
    expect(userWrite).toBeGreaterThan(claim);
    expect(block).not.toContain(".select({\n        id: schema.emailVerificationTokens.id");
  });

  it("claims a password-reset token conditionally before rotating the password", () => {
    const block = service.slice(service.indexOf("async completePasswordReset"));
    const claim = block.indexOf(".update(schema.passwordResetTokens)");
    const userWrite = block.indexOf(".update(schema.users)");

    expect(block).toContain("drizzle.transaction");
    expect(block).toContain("gte(schema.passwordResetTokens.expiresAt, now)");
    expect(block).toContain("isNull(schema.passwordResetTokens.usedAt)");
    expect(block).toContain(".returning({ userId: schema.passwordResetTokens.userId })");
    expect(claim).toBeGreaterThan(-1);
    expect(userWrite).toBeGreaterThan(claim);
    expect(block).not.toContain(".select()\n      .from(schema.passwordResetTokens)");
  });
});
