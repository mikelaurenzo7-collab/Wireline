import { describe, expect, it } from "vitest";
import { isOwnerOnlyAdminTab, isWirelineOperator, OWNER_ONLY_ADMIN_TABS } from "./admin-access";

describe("admin-access", () => {
  it("defines system as owner-only tab", () => {
    expect(OWNER_ONLY_ADMIN_TABS).toContain("system");
    expect(isOwnerOnlyAdminTab("system")).toBe(true);
    expect(isOwnerOnlyAdminTab("subscription")).toBe(false);
  });

  it("identifies wireline operators by is_owner flag", () => {
    expect(isWirelineOperator({ is_owner: true })).toBe(true);
    expect(isWirelineOperator({ is_owner: false })).toBe(false);
    expect(isWirelineOperator(null)).toBe(false);
  });
});
