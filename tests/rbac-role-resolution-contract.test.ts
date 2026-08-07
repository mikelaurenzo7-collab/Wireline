import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ALL_ROLES,
  FALLBACK_ACCESS_ROLE,
  ROLE_PERMISSIONS,
  hasPermission,
  resolveStoredRole,
} from "../src/lib/soc2-controls";
import { getCallerRole, invalidateRoleCache } from "../src/middleware/require-role";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * Team invitations persist one role vocabulary (admin | member | viewer, default
 * "member") and authorization speaks another (owner | admin | Account Holder |
 * viewer | auditor). The two forked, and getCallerRole resolved the gap by
 * initialising to "owner" and narrowing only on a recognised string — so
 * "member", the invite default AND its least-privileged intended seat, resolved
 * to full owner privilege on every requirePermission/requireRole route.
 *
 * The privilege ordering was inverted: "admin" and "viewer" were enforced
 * correctly, and only the safe-looking default escalated.
 *
 * These are behavioural tests, not source reads. The defect lived in the
 * resolution logic, so the gate has to exercise it.
 */

/** Minimal stand-in for the drizzle query chain getCallerRole uses. */
function fakeDrizzle(rows: Array<{ role: string | null }>) {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return chain as never;
}

const TENANT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

describe("RBAC stored-role resolution", () => {
  beforeEach(() => {
    invalidateRoleCache(MEMBER, TENANT);
    invalidateRoleCache(TENANT, TENANT);
  });

  it("never resolves a stored role to owner except the literal owner", () => {
    // This is the whole defect in one assertion. Owner is the most privileged
    // role in the system; nothing should reach it by falling through.
    const inputs = [
      "member",
      "operator",
      "viewer",
      "admin",
      "auditor",
      "Account Holder",
      "",
      "nonsense",
      "MEMBER",
      "Owner",
      null,
      undefined,
    ];
    for (const input of inputs) {
      const resolved = resolveStoredRole(input);
      expect(resolved === "owner", `resolveStoredRole(${JSON.stringify(input)})`).toBe(false);
    }
    expect(resolveStoredRole("owner")).toBe("owner");
  });

  it("gives an invited member the mid-tier seat, not team or billing control", () => {
    const role = resolveStoredRole("member");
    expect(ALL_ROLES).toContain(role);

    // What a member must NOT be able to do — each of these was reachable.
    for (const forbidden of [
      "team.manage",
      "billing.manage",
      "settings.manage",
      "quotas.override",
      "jobs.admin",
      "audit.read",
      "agents.manage",
    ]) {
      expect(hasPermission(role, forbidden), `member must not hold ${forbidden}`).toBe(false);
    }
    // What a member SHOULD keep — resolving them down to nothing would be its
    // own regression.
    for (const allowed of ["calls.read", "calls.manage", "leads.read", "leads.manage"]) {
      expect(hasPermission(role, allowed), `member should hold ${allowed}`).toBe(true);
    }
  });

  it("resolves every role the invite schema can persist", () => {
    // The fork is only closed if these two vocabularies stay reconciled. Adding
    // a role to the invite enum without mapping it here fails this test rather
    // than silently landing on the fallback in production.
    const validation = read("src/lib/api-validation-base.ts");
    const enumMatch = /role: z\s*\.enum\(\[([^\]]*)\]\)/.exec(validation);
    expect(enumMatch, "invite role enum not found in api-validation-base.ts").toBeTruthy();
    const invitable = (enumMatch![1].match(/"([^"]+)"/g) || []).map((v) => v.replace(/"/g, ""));
    expect(invitable.length).toBeGreaterThan(0);

    for (const invited of invitable) {
      const resolved = resolveStoredRole(invited);
      expect(ALL_ROLES, `invite role "${invited}" resolves outside the hierarchy`).toContain(
        resolved,
      );
      expect(resolved === "owner", `invite role "${invited}" escalates to owner`).toBe(false);
      // An invitable role landing on the fallback means it is unmapped, which
      // silently under-privileges a real customer.
      if (invited !== FALLBACK_ACCESS_ROLE) {
        expect(resolved, `invite role "${invited}" is unmapped`).not.toBe(FALLBACK_ACCESS_ROLE);
      }
    }
  });

  it("does not treat inherited Object keys as roles", () => {
    // ROLE_HIERARCHY is a plain object, so `"constructor" in ROLE_HIERARCHY` is
    // true. A membership row holding such a string must not pass as a role.
    for (const inherited of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(resolveStoredRole(inherited), inherited).toBe(FALLBACK_ACCESS_ROLE);
    }
  });

  it("keeps the least-privileged fallback genuinely least-privileged", () => {
    const fallbackPermissions = ROLE_PERMISSIONS[FALLBACK_ACCESS_ROLE];
    expect(fallbackPermissions.length).toBeGreaterThan(0);
    for (const role of ALL_ROLES) {
      if (role === FALLBACK_ACCESS_ROLE) continue;
      const extra = fallbackPermissions.filter((p) => !ROLE_PERMISSIONS[role].includes(p));
      // The fallback may hold fewer permissions than another role, never a
      // privilege that role lacks — otherwise "unknown" grants something.
      if (role === "auditor") continue; // auditor trades leads.read for audit.read
      expect(extra, `${FALLBACK_ACCESS_ROLE} holds permissions ${role} lacks`).toEqual([]);
    }
    expect(hasPermission(FALLBACK_ACCESS_ROLE, "audit.read")).toBe(false);
    expect(hasPermission(FALLBACK_ACCESS_ROLE, "team.manage")).toBe(false);
  });

  it("resolves an accepted member invite through getCallerRole without owner privilege", async () => {
    const role = await getCallerRole(fakeDrizzle([{ role: "member" }]), TENANT, MEMBER);
    expect(role).not.toBe("owner");
    expect(hasPermission(role, "team.manage")).toBe(false);
    expect(hasPermission(role, "billing.manage")).toBe(false);
  });

  it("still treats a caller with no membership row as owner of their own tenant", async () => {
    // The single-tenant fallback documented at the top of require-role.ts.
    // Fixing the escalation must not break fresh installs.
    const role = await getCallerRole(fakeDrizzle([]), TENANT, TENANT);
    expect(role).toBe("owner");
  });

  it("refuses a caller with no membership row in someone else's tenant", async () => {
    await expect(getCallerRole(fakeDrizzle([]), TENANT, MEMBER)).rejects.toThrow(
      /No active membership/,
    );
  });

  it("resolves an unknown stored role down rather than leaving it at the default", async () => {
    const role = await getCallerRole(fakeDrizzle([{ role: "some-future-tier" }]), TENANT, MEMBER);
    expect(role).toBe(FALLBACK_ACCESS_ROLE);
    expect(hasPermission(role, "team.manage")).toBe(false);
  });

  it("keeps explicitly granted admin and viewer seats working", async () => {
    const admin = await getCallerRole(fakeDrizzle([{ role: "admin" }]), TENANT, MEMBER);
    expect(admin).toBe("admin");
    expect(hasPermission(admin, "team.manage")).toBe(true);
    expect(hasPermission(admin, "billing.manage")).toBe(false); // owner-only

    invalidateRoleCache(MEMBER, TENANT);
    const viewer = await getCallerRole(fakeDrizzle([{ role: "viewer" }]), TENANT, MEMBER);
    expect(viewer).toBe("viewer");
    expect(hasPermission(viewer, "calls.manage")).toBe(false);
  });

  it("resolves the stored role in one place so callers cannot re-fork it", () => {
    // The old resolution was inline in require-role.ts. Keeping the mapping in
    // soc2-controls (which owns the vocabulary) is what stops the next consumer
    // from writing its own `stored in ROLE_HIERARCHY` test and reopening this.
    const middleware = read("src/middleware/require-role.ts");
    expect(middleware).toContain("resolveStoredRole(data.role)");
    expect(middleware).not.toMatch(/let role: AccessRole = "owner"/);
    // Owner must only be reachable from the no-membership-row branch.
    const resolution = middleware.slice(
      middleware.indexOf("if (!data) {"),
      middleware.indexOf("roleCache.set(cacheKey, { role, cached_at: Date.now() });"),
    );
    expect(resolution).toContain("if (tenantId !== userId) {");
    expect((resolution.match(/return "owner";/g) || []).length).toBe(1);
  });
});
