import { describe, expect, it, vi } from "vitest";
import {
  computeScheduledPurgeAt,
  purgeAccount,
  ACCOUNT_DELETION_GRACE_DAYS,
  ACCOUNT_DELETION_TABLES,
} from "./account-deletion";

describe("Account Deletion", () => {
  describe("computeScheduledPurgeAt", () => {
    it("correctly adds the deletion grace days (30 days)", () => {
      const baseDate = new Date("2026-05-28T12:00:00.000Z");
      const scheduledDate = computeScheduledPurgeAt(baseDate);

      const diffMs = scheduledDate.getTime() - baseDate.getTime();
      const expectedMs = ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
      expect(diffMs).toBe(expectedMs);
      expect(scheduledDate.toISOString()).toBe("2026-06-27T12:00:00.000Z");
    });
  });

  describe("purgeAccount", () => {
    it("does not delete the global stripe_events idempotency ledger", () => {
      expect(ACCOUNT_DELETION_TABLES).not.toContain("wireline_stripe_events");
    });

    it("purges PII-bearing auth token tables", () => {
      expect(ACCOUNT_DELETION_TABLES).toContain("wireline_password_reset_tokens");
      expect(ACCOUNT_DELETION_TABLES).toContain("wireline_email_verification_tokens");
    });

    it("successfully runs transaction and returns ok: true with all touched tables", async () => {
      const mockTx = {
        execute: vi.fn().mockResolvedValue({ rows: [{ table_exists: true }] }),
      };
      const mockDb = {
        transaction: vi.fn(async (cb) => {
          return cb(mockTx);
        }),
      } as any;

      const mockLog = {
        warn: vi.fn(),
        error: vi.fn(),
      };

      const userId = "8b9e67f2-1a22-4915-bb86-d2495d4ea711";
      const result = await purgeAccount(userId, { db: mockDb, log: mockLog });

      expect(result.ok).toBe(true);
      expect(result.authRemoved).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.tablesTouched.length).toBeGreaterThan(0);

      // Each table: existence check + DELETE, then wireline_users DELETE
      expect(mockTx.execute).toHaveBeenCalledTimes(result.tablesTouched.length * 2 + 1);
      expect(mockDb.transaction).toHaveBeenCalled();

      // Verify that log.error was not called
      expect(mockLog.error).not.toHaveBeenCalled();
    });

    it("handles database delete execution failures, logs error and returns ok: false", async () => {
      const mockTx = {
        execute: vi.fn().mockRejectedValue(new Error("Database connection timed out")),
      };
      const mockDb = {
        transaction: vi.fn(async (cb) => {
          return cb(mockTx);
        }),
      } as any;

      const mockLog = {
        warn: vi.fn(),
        error: vi.fn(),
      };

      const userId = "8b9e67f2-1a22-4915-bb86-d2495d4ea711";
      const result = await purgeAccount(userId, { db: mockDb, log: mockLog });

      expect(result.ok).toBe(false);
      expect(result.authRemoved).toBe(false);
      expect(result.error).toBe("Database connection timed out");
      expect(mockLog.error).toHaveBeenCalledWith(
        "account purge transaction failed",
        expect.objectContaining({ error: "Database connection timed out" }),
      );
    });
  });
});
