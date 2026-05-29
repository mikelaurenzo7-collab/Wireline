import { describe, expect, it } from "vitest";
import {
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  ALL_ROLES,
  hasPermission,
  canGrantRole,
} from "./soc2-controls";

describe("soc2-controls — RBAC", () => {
  describe("ROLE_HIERARCHY", () => {
    it("owner is highest privilege", () => {
      expect(ROLE_HIERARCHY["owner"]).toBeGreaterThan(ROLE_HIERARCHY["admin"]);
      expect(ROLE_HIERARCHY["owner"]).toBeGreaterThan(ROLE_HIERARCHY["operator"]);
      expect(ROLE_HIERARCHY["owner"]).toBeGreaterThan(ROLE_HIERARCHY["viewer"]);
      expect(ROLE_HIERARCHY["owner"]).toBeGreaterThan(ROLE_HIERARCHY["auditor"]);
    });

    it("hierarchy is strictly ordered: owner > admin > operator > viewer > auditor", () => {
      expect(ROLE_HIERARCHY["owner"]).toBeGreaterThan(ROLE_HIERARCHY["admin"]);
      expect(ROLE_HIERARCHY["admin"]).toBeGreaterThan(ROLE_HIERARCHY["operator"]);
      expect(ROLE_HIERARCHY["operator"]).toBeGreaterThan(ROLE_HIERARCHY["viewer"]);
      expect(ROLE_HIERARCHY["viewer"]).toBeGreaterThan(ROLE_HIERARCHY["auditor"]);
    });

    it("all roles are represented", () => {
      for (const role of ALL_ROLES) {
        expect(ROLE_HIERARCHY[role]).toBeDefined();
        expect(typeof ROLE_HIERARCHY[role]).toBe("number");
      }
    });
  });

  describe("ROLE_PERMISSIONS", () => {
    it("owner has billing.manage", () => {
      expect(ROLE_PERMISSIONS["owner"]).toContain("billing.manage");
    });

    it("admin does NOT have billing.manage", () => {
      expect(ROLE_PERMISSIONS["admin"]).not.toContain("billing.manage");
    });

    it("viewer can only read, never manage", () => {
      for (const perm of ROLE_PERMISSIONS["viewer"]) {
        expect(perm).toMatch(/\.read$/);
      }
    });

    it("auditor has audit.read", () => {
      expect(ROLE_PERMISSIONS["auditor"]).toContain("audit.read");
    });

    it("operator cannot manage team or billing", () => {
      expect(ROLE_PERMISSIONS["operator"]).not.toContain("team.manage");
      expect(ROLE_PERMISSIONS["operator"]).not.toContain("billing.manage");
    });

    it("every role has at least one permission", () => {
      for (const role of ALL_ROLES) {
        expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
      }
    });
  });

  describe("hasPermission", () => {
    it("returns true for owner with billing.manage", () => {
      expect(hasPermission("owner", "billing.manage")).toBe(true);
    });

    it("returns false for viewer with billing.manage", () => {
      expect(hasPermission("viewer", "billing.manage")).toBe(false);
    });

    it("returns false for non-existent permission", () => {
      expect(hasPermission("owner", "nonexistent.permission")).toBe(false);
    });

    it("auditor can read audit", () => {
      expect(hasPermission("auditor", "audit.read")).toBe(true);
    });

    it("auditor cannot manage agents", () => {
      expect(hasPermission("auditor", "agents.manage")).toBe(false);
    });
  });

  describe("canGrantRole", () => {
    it("owner can grant admin", () => {
      expect(canGrantRole("owner", "admin")).toBe(true);
    });

    it("owner can grant any role below owner", () => {
      expect(canGrantRole("owner", "admin")).toBe(true);
      expect(canGrantRole("owner", "operator")).toBe(true);
      expect(canGrantRole("owner", "viewer")).toBe(true);
      expect(canGrantRole("owner", "auditor")).toBe(true);
    });

    it("owner cannot grant owner (not strictly below)", () => {
      expect(canGrantRole("owner", "owner")).toBe(false);
    });

    it("admin can grant operator and below", () => {
      expect(canGrantRole("admin", "operator")).toBe(true);
      expect(canGrantRole("admin", "viewer")).toBe(true);
      expect(canGrantRole("admin", "auditor")).toBe(true);
    });

    it("admin cannot grant admin (same level)", () => {
      expect(canGrantRole("admin", "admin")).toBe(false);
    });

    it("admin cannot grant owner (above)", () => {
      expect(canGrantRole("admin", "owner")).toBe(false);
    });

    it("operator can grant viewer and auditor", () => {
      expect(canGrantRole("operator", "viewer")).toBe(true);
      expect(canGrantRole("operator", "auditor")).toBe(true);
    });

    it("operator cannot grant operator (same level)", () => {
      expect(canGrantRole("operator", "operator")).toBe(false);
    });

    it("viewer cannot grant any role (below minimum grant level)", () => {
      expect(canGrantRole("viewer", "auditor")).toBe(false);
      expect(canGrantRole("viewer", "viewer")).toBe(false);
    });

    it("auditor cannot grant any role (below minimum grant level)", () => {
      expect(canGrantRole("auditor", "viewer")).toBe(false);
    });
  });
});
