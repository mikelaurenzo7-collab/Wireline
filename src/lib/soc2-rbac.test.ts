import { describe, it, expect } from "vitest";
import { hasPermission, canGrantRole } from "./soc2-controls";

describe("soc2-controls · RBAC helpers", () => {
  it("owner holds billing.manage", () => {
    expect(hasPermission("owner", "billing.manage")).toBe(true);
    expect(hasPermission("operator", "billing.manage")).toBe(false);
  });

  it("prevents operators from granting peer admin roles", () => {
    expect(canGrantRole("operator", "viewer")).toBe(false);
    expect(canGrantRole("admin", "operator")).toBe(true);
    expect(canGrantRole("owner", "admin")).toBe(true);
  });

  it("never allows granting at or above granter depth", () => {
    expect(canGrantRole("admin", "owner")).toBe(false);
    expect(canGrantRole("viewer", "auditor")).toBe(false);
  });
});
