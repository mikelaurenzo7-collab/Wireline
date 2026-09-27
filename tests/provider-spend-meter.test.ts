import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { managedAiSpendPredicate, providerSpendMeter } from "../src/lib/provider-spend-meter";

describe("managed AI versus live phone accounting", () => {
  it("recognizes existing server-owned PSTN receipts without a migration", () => {
    expect(
      providerSpendMeter({
        action: "voice.realtime.session",
        provider: "openai",
        metadata: { surface: "openai_sip" },
      }),
    ).toBe("live_voice");
  });

  it.each([
    undefined,
    null,
    {},
    [],
    "openai_sip",
    { surface: null },
    { surface: "studio_simulation" },
    { surface: "live_voice_session" },
    { surface: "OPENAI_SIP" },
    { meter: "live_voice" },
  ])("keeps unknown and private-preview metadata on the AI cap: %j", (metadata) => {
    expect(
      providerSpendMeter({ action: "voice.realtime.session", provider: "openai", metadata }),
    ).toBe("managed_ai");
  });

  it.each([
    { action: "training", provider: "openai" },
    { action: "voice.realtime.session", provider: "other" },
    { action: null, provider: "openai" },
    { action: "voice.realtime.session", provider: null },
  ])("does not exempt an unrelated receipt from its metadata alone", (row) => {
    expect(providerSpendMeter({ ...row, metadata: { surface: "openai_sip" } })).toBe("managed_ai");
  });

  it("uses a null-safe SQL exclusion with the same exact action/provider/surface", () => {
    const query = new PgDialect().sqlToQuery(managedAiSpendPredicate());
    expect(query.sql).toContain("not coalesce(");
    expect(query.sql).toContain('"wireline_audit_log"."action" = \'voice.realtime.session\'');
    expect(query.sql).toContain('"wireline_audit_log"."provider" = \'openai\'');
    expect(query.sql).toContain("->>'surface' = 'openai_sip', false)");
  });
});
