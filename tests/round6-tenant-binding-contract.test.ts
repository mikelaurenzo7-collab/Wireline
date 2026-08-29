import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("round-6 phone-line tenant binding", () => {
  const carrier = read("src/routes/carrier-routes.ts");

  it("retires the manual line-claim POST in favor of native phone setup", () => {
    const handler = carrier.slice(
      carrier.indexOf('"/api/phone-numbers",'),
      carrier.indexOf('"/api/phone-numbers/provision"'),
    );
    // POST /api/phone-numbers appears after GET; the create arm is closed.
    expect(handler).toContain('code: "NATIVE_PHONE_REQUIRED"');
    expect(handler).toContain("res.status(410).json");
    expect(handler).not.toContain("getIncludedPhoneLineSlots(req.user.id)");
  });

  it("gates the pool claim and area-code search endpoints on plan capacity", () => {
    const claim = carrier.slice(
      carrier.indexOf('"/api/phone-numbers/claim"'),
      carrier.indexOf('"/api/carrier/numbers"'),
    );
    expect(claim).toContain("getIncludedPhoneLineSlots(req.user.id)");
    expect(claim).toContain("PHONE_CAPACITY_REACHED");
    expect(claim).toContain("rethrowIfAppError");

    const search = carrier.slice(
      carrier.indexOf('"/api/phone-numbers/search"'),
      carrier.indexOf('"/api/phone-numbers/claim"'),
    );
    expect(search).toContain("PHONE_CAPACITY_REACHED");
  });

  it("refuses to bind a Vapi line already held by another workspace", () => {
    const claim = carrier.slice(
      carrier.indexOf('"/api/phone-numbers/claim"'),
      carrier.indexOf('"/api/carrier/numbers"'),
    );
    expect(claim).toContain("selectClaimedVapiIdsOutsideTenantContext");
    expect(claim).toContain("claimed.has(match.id)");
    expect(claim).toContain("That number was just claimed");
  });

  it("keeps the storage-layer backstop that makes a duplicate claim impossible", () => {
    // The inbound webhook resolver keys on vapi_number_id with LIMIT 1, so a
    // second row for the same line would hand the call to whichever row won.
    const schemaSrc = read("src/db/schema.ts");
    expect(schemaSrc).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_numbers_vapi_number_id_unique",
    );
    const migration = read("drizzle/migrations/0111_phone_number_tenant_binding.sql");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(migration).toContain("idx_phone_numbers_user_id");

    const resolver = read("src/lib/vapi-webhook-agent.ts");
    expect(resolver).toContain("eq(schema.phoneNumbers.vapiNumberId, phoneNumberId)");
  });
});

describe("round-6 agent-create capacity serialization", () => {
  it("serializes the mobile create path the same way the web path is", () => {
    // Reading the count outside the transaction let concurrent mobile creates
    // all observe the same pre-insert total and every one of them clear the cap.
    const mobile = read("src/routes/mobile-routes.ts");
    const create = mobile.slice(
      mobile.indexOf('"/api/mobile/agents",'),
      mobile.indexOf('router.get(\n  "/api/mobile/agents"'),
    );
    const lockIdx = create.indexOf("pg_advisory_xact_lock");
    const rosterIdx = create.indexOf("const existingAgents = await tx");
    const insertIdx = create.indexOf("tx.insert(schema.agents)");

    expect(lockIdx).toBeGreaterThan(-1);
    expect(rosterIdx).toBeGreaterThan(lockIdx);
    expect(insertIdx).toBeGreaterThan(rosterIdx);
    expect(create).toContain("AGENT_CAPACITY_REACHED");
  });
});
