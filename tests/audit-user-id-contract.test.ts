import { describe, expect, it } from "vitest";
import { normalizeAuditUserIdForRecord } from "../src/lib/audit-user-id";

const VALID_UUID = "00000000-0000-4000-8000-000000000000";

describe("audit user id normalization", () => {
  it("keeps valid UUID user ids in the audit user_id column", () => {
    expect(normalizeAuditUserIdForRecord(VALID_UUID, { resource: "auth" })).toEqual({
      userId: VALID_UUID,
      metadata: { resource: "auth" },
    });
  });

  it("moves non-UUID identities into metadata instead of the uuid column", () => {
    expect(normalizeAuditUserIdForRecord("user@example.com", { resource: "auth" })).toEqual({
      userId: undefined,
      metadata: {
        resource: "auth",
        invalid_user_id: "user@example.com",
        invalid_user_id_reason: "non_uuid",
      },
      droppedUserId: "user@example.com",
    });
  });
});
