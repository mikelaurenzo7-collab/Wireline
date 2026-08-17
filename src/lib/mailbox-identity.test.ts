import { describe, expect, it } from "vitest";

import {
  MAILBOX_SCOPED_ID_PREFIX,
  isMailboxScopedExternalId,
  mailboxScopedExternalId,
} from "./mailbox-identity";

describe("mailbox-scoped provider identity", () => {
  it("is deterministic and fixed-length for retries", () => {
    const first = mailboxScopedExternalId(
      "11111111-1111-4111-8111-111111111111",
      "provider-thread-1",
    );
    const retry = mailboxScopedExternalId(
      "11111111-1111-4111-8111-111111111111",
      "provider-thread-1",
    );

    expect(first).toBe(retry);
    expect(first).toHaveLength(MAILBOX_SCOPED_ID_PREFIX.length + 64);
    expect(isMailboxScopedExternalId(first)).toBe(true);
    expect(first).not.toContain("provider-thread-1");
    expect(first).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("separates identical provider ids from two connected mailboxes", () => {
    const firstMailbox = mailboxScopedExternalId(
      "11111111-1111-4111-8111-111111111111",
      "same-provider-id",
    );
    const secondMailbox = mailboxScopedExternalId(
      "22222222-2222-4222-8222-222222222222",
      "same-provider-id",
    );

    expect(firstMailbox).not.toBe(secondMailbox);
  });

  it("preserves provider-id byte identity instead of trimming meaningful data", () => {
    expect(
      mailboxScopedExternalId("11111111-1111-4111-8111-111111111111", "message-id"),
    ).not.toBe(
      mailboxScopedExternalId("11111111-1111-4111-8111-111111111111", " message-id "),
    );
  });

  it("normalizes account UUID case while rejecting empty identity inputs", () => {
    expect(
      mailboxScopedExternalId("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", "message-id"),
    ).toBe(mailboxScopedExternalId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "message-id"));

    expect(() => mailboxScopedExternalId("", "message-id")).toThrow(
      /mailbox account id is required/,
    );
    expect(() => mailboxScopedExternalId("account", "   ")).toThrow(
      /mailbox external id is required/,
    );
    expect(isMailboxScopedExternalId("provider-thread-1")).toBe(false);
  });
});
