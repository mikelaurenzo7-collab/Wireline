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

  it("removes expired recovery credentials during recurring retention work", () => {
    const worker = read("src/lib/job-worker-base.ts");
    const block = functionBlock(
      worker,
      'if (job.type === "purge_old_data")',
      'if (job.type === "purge_deleted_account")',
    );

    expect(block).toContain(".delete(schema.emailVerificationTokens)");
    expect(block).toContain("eq(schema.emailVerificationTokens.userId, p.user_id)");
    expect(block).toContain("lt(schema.emailVerificationTokens.expiresAt, expiredBefore)");
    expect(block).toContain(".delete(schema.passwordResetTokens)");
    expect(block).toContain("eq(schema.passwordResetTokens.userId, p.user_id)");
    expect(block).toContain("lt(schema.passwordResetTokens.expiresAt, expiredBefore)");

    // Maintenance uses one tenant-scoped pool client at a time.
    expect(block.indexOf(".delete(schema.emailVerificationTokens)")).toBeLessThan(
      block.indexOf(".delete(schema.passwordResetTokens)"),
    );
    expect(block).not.toContain("Promise.all");
  });
});
