import { describe, expect, it } from "vitest";

import {
  clearPendingEmailReplyOperation,
  loadPendingEmailReplyOperation,
  savePendingEmailReplyOperation,
} from "../src/lib/email-reply-operation";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("pending email reply operation storage", () => {
  it("restores the same operation key after the composer remounts", () => {
    const storage = memoryStorage();
    const operationKey = "b9f2ee41-3559-4e7c-9123-c253a17fedaa";

    expect(savePendingEmailReplyOperation("thread/one", operationKey, storage)).toBe(true);
    expect(loadPendingEmailReplyOperation("thread/one", storage)).toBe(operationKey);
    expect(loadPendingEmailReplyOperation("thread/two", storage)).toBeNull();
  });

  it("clears a resolved operation and rejects invalid keys", () => {
    const storage = memoryStorage();
    expect(savePendingEmailReplyOperation("thread", "not-a-uuid", storage)).toBe(false);
    expect(loadPendingEmailReplyOperation("thread", storage)).toBeNull();

    const operationKey = "b9f2ee41-3559-4e7c-9123-c253a17fedaa";
    expect(savePendingEmailReplyOperation("thread", operationKey, storage)).toBe(true);
    expect(clearPendingEmailReplyOperation("thread", storage)).toBe(true);
    expect(loadPendingEmailReplyOperation("thread", storage)).toBeNull();
  });

  it("fails closed when session storage is unavailable", () => {
    expect(
      savePendingEmailReplyOperation("thread", "b9f2ee41-3559-4e7c-9123-c253a17fedaa", null),
    ).toBe(false);
    expect(loadPendingEmailReplyOperation("thread", null)).toBeNull();
    expect(clearPendingEmailReplyOperation("thread", null)).toBe(false);
  });
});
