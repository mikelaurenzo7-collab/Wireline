import { describe, it, expect } from "vitest";
import {
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  ALL_ROLES,
  hasPermission,
  canGrantRole,
  buildChangeLogRow,
  buildIncidentRow,
  notificationDeadlineIso,
  looksEncrypted,
  type AccessRole,
} from "./soc2-controls";

describe("soc2-controls · role hierarchy", () => {
  it("owner outranks all other roles", () => {
    const ownerLevel = ROLE_HIERARCHY.owner;
    for (const role of ALL_ROLES.filter(r => r !== "owner")) {
      expect(ownerLevel).toBeGreaterThan(ROLE_HIERARCHY[role]);
    }
  });
  it("all roles are present in hierarchy", () => {
    for (const r of ALL_ROLES) {
      expect(typeof ROLE_HIERARCHY[r]).toBe("number");
    }
  });
  it("hierarchy values are unique", () => {
    const values = Object.values(ROLE_HIERARCHY);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("soc2-controls · hasPermission", () => {
  it("owner has billing.manage", () => {
    expect(hasPermission("owner", "billing.manage")).toBe(true);
  });
  it("viewer does NOT have billing.manage", () => {
    expect(hasPermission("viewer", "billing.manage")).toBe(false);
  });
  it("auditor can read audit log", () => {
    expect(hasPermission("auditor", "audit.read")).toBe(true);
  });
  it("auditor cannot manage agents", () => {
    expect(hasPermission("auditor", "agents.manage")).toBe(false);
  });
  it("every permission set is non-empty", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});

describe("soc2-controls · canGrantRole", () => {
  it("owner can grant admin", () => {
    expect(canGrantRole("owner", "admin")).toBe(true);
  });
  it("owner can grant viewer", () => {
    expect(canGrantRole("owner", "viewer")).toBe(true);
  });
  it("owner cannot grant owner (must be strictly below)", () => {
    expect(canGrantRole("owner", "owner")).toBe(false);
  });
  it("admin cannot grant admin (same level)", () => {
    expect(canGrantRole("admin", "admin")).toBe(false);
  });
  it("admin cannot grant owner", () => {
    expect(canGrantRole("admin", "owner")).toBe(false);
  });
  it("viewer cannot grant any role", () => {
    for (const target of ALL_ROLES) {
      expect(canGrantRole("viewer", target)).toBe(false);
    }
  });
  it("operator can grant viewer and auditor", () => {
    expect(canGrantRole("operator", "viewer")).toBe(true);
    expect(canGrantRole("operator", "auditor")).toBe(true);
    expect(canGrantRole("operator", "operator")).toBe(false);
  });
});

describe("soc2-controls · buildChangeLogRow", () => {
  it("includes all required fields", () => {
    const row = buildChangeLogRow({
      tenant_id: "t-1",
      actor_user_id: "u-1",
      actor_email: "admin@example.com",
      change_type: "access_grant",
      target_email: "user@example.com",
      new_value: "operator",
      justification: "Onboarded new CSR",
    });
    expect(row.tenant_id).toBe("t-1");
    expect(row.change_type).toBe("access_grant");
    expect(row.justification).toBe("Onboarded new CSR");
    expect(typeof row.created_at).toBe("string");
    expect(row.metadata).toEqual({});
  });

  it("nullifies optional fields when absent", () => {
    const row = buildChangeLogRow({
      tenant_id: "t",
      actor_user_id: "u",
      actor_email: "a@b.com",
      change_type: "config_change",
    });
    expect(row.target_user_id).toBeNull();
    expect(row.approved_by).toBeNull();
  });
});

describe("soc2-controls · incident response", () => {
  it("P1 notification deadline is 72h after detection", () => {
    const detected = new Date("2026-05-09T12:00:00Z").toISOString();
    const deadline = notificationDeadlineIso({ severity: "P1", detected_at: detected });
    expect(deadline).toBe("2026-05-12T12:00:00.000Z");
  });
  it("P2 also has 72h deadline", () => {
    const detected = new Date("2026-05-09T00:00:00Z").toISOString();
    const deadline = notificationDeadlineIso({ severity: "P2", detected_at: detected });
    expect(deadline).not.toBeNull();
  });
  it("P3/P4 have no GDPR deadline (return null)", () => {
    expect(notificationDeadlineIso({ severity: "P3", detected_at: new Date().toISOString() })).toBeNull();
    expect(notificationDeadlineIso({ severity: "P4", detected_at: new Date().toISOString() })).toBeNull();
  });
  it("buildIncidentRow embeds deadline and timestamps", () => {
    const row = buildIncidentRow({
      severity: "P1",
      title: "Data breach",
      description: "Unauthorized access detected",
      detected_at: new Date().toISOString(),
      reporter_email: "security@example.com",
      affected_systems: ["supabase", "vapi"],
    });
    expect(row.notification_deadline).toBeTruthy();
    expect(Array.isArray(row.affected_systems)).toBe(true);
    expect(typeof row.created_at).toBe("string");
  });
});

describe("soc2-controls · looksEncrypted", () => {
  it("accepts SHA-256 hex digests (intake key storage)", () => {
    expect(looksEncrypted("a".repeat(64))).toBe(true);
    expect(looksEncrypted("0123456789abcdef".repeat(4))).toBe(true);
  });
  it("accepts bcrypt hashes", () => {
    expect(looksEncrypted("$2b$12$somehashstring")).toBe(true);
    expect(looksEncrypted("$2a$10$anotherhash")).toBe(true);
  });
  it("accepts ek_ prefixed encrypted keys", () => {
    expect(looksEncrypted("ek_v1_encrypted_payload")).toBe(true);
  });
  it("rejects plaintext values", () => {
    expect(looksEncrypted("sk-ant-api03-somekey")).toBe(false);
    expect(looksEncrypted("wlk_plaintext_key")).toBe(false);
    expect(looksEncrypted("")).toBe(false);
    expect(looksEncrypted(null)).toBe(false);
  });
});
