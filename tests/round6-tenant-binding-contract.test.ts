import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("round-6 phone-line tenant binding", () => {
  const carrier = read("src/routes/carrier-routes.ts");

  it("gates the manual line-claim endpoint on plan capacity", () => {
    const handler = carrier.slice(
      carrier.indexOf('"/api/phone-numbers",'),
      carrier.indexOf('"/api/phone-numbers/provision"'),
    );
    expect(handler).toContain("getIncludedPhoneLineSlots(req.user.id)");
    expect(handler).toContain("PHONE_CAPACITY_REACHED");
  });

  it("refuses to bind a Vapi line already held by another workspace", () => {
    const handler = carrier.slice(
      carrier.indexOf('"/api/phone-numbers",'),
      carrier.indexOf('"/api/phone-numbers/provision"'),
    );
    expect(handler).toContain("schema.phoneNumbers.vapiNumberId, vapi_number_id");
    expect(handler).toContain("claimed.userId !== req.user.id");
    expect(handler).toContain("NUMBER_ALREADY_BOUND");
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
    const countIdx = create.indexOf("count(*)");
    const insertIdx = create.indexOf("tx.insert(schema.agents)");

    expect(lockIdx).toBeGreaterThan(-1);
    expect(countIdx).toBeGreaterThan(lockIdx);
    expect(insertIdx).toBeGreaterThan(countIdx);
    expect(create).toContain("AGENT_CAPACITY_REACHED");
  });
});
