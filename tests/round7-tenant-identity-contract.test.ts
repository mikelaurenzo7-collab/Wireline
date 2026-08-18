import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("round-7 shared-provider tenant identity", () => {
  it("scopes the live carrier listing to lines the caller owns", () => {
    const native = read("src/routes/native-phone-routing-routes.ts");
    const handler = native.slice(native.indexOf('"/api/carrier/numbers"'));
    expect(handler).toContain("schema.phoneNumbers.userId, req.user.id");
    expect(handler).not.toContain("listVapiNumbers");
    expect(handler).not.toContain("ownedVapiIds");
  });

  it("refuses to adopt a telecom identity the workspace does not own", () => {
    // E.164 / id-shape validation is not a boundary here: a neighbour's real
    // number passes both, and the shared platform credential owns it, so the
    // provider accepts it.
    const settings = read("src/routes/settings-routes.ts");
    expect(settings).toContain("async function assertTelecomIdentityOwned");
    expect(settings).toContain("await assertTelecomIdentityOwned(req.user.id, update)");
    const fn = settings.slice(
      settings.indexOf("async function assertTelecomIdentityOwned"),
      settings.indexOf('router.post(\n  "/api/settings"'),
    );
    expect(fn).toContain("schema.phoneNumbers.userId, userId");
    expect(fn).toContain("row.vapiNumberId === vapiId");
    expect(fn).toContain("row.phoneNumber === smsFrom");
    // The WhatsApp sender is the enumerable variant of the same shared-credential
    // identity and must be owned before it can be adopted.
    expect(fn).toContain("update.twilioWhatsappFromNumber");
    expect(fn).toContain("row.phoneNumber === whatsappFrom");
    expect(fn).toContain("403");
  });

  it("settles the daily voice burst cap atomically with each provider call", () => {
    // Dial-time authorization reserves zero units. Completed-call settlement
    // therefore owns the daily counter, and it must share the same transaction
    // as the provider-call idempotency claim so retries cannot double count.
    const usage = read("src/lib/voice-usage.ts");
    const prepare = usage.slice(
      usage.indexOf("async function prepareVoiceUsage"),
      usage.indexOf("export async function trackVoiceMinutes"),
    );
    expect(prepare).toContain("return drizzle.transaction(async (tx) =>");
    expect(prepare).toContain(".insert(voiceUsageEvents)");
    expect(prepare).toContain('dimension: "voice_minutes_daily"');
    expect(prepare).toContain("periodKey: dailyKey");
    expect(prepare).toContain("if (!inserted) {");
    expect(prepare.indexOf("if (!inserted) {")).toBeLessThan(
      prepare.indexOf('dimension: "voice_minutes_daily"'),
    );
    expect(usage).not.toContain('checkAndIncrement(userId, "voice_minutes_daily"');

    const control = read("src/lib/voice-spend-control.ts");
    expect(control).toContain('"voice_minutes_daily"');

    // Guard the regression: settlement still derives from billable minutes.
    expect(usage).toContain("const minutes = billableVoiceMinutes(durationSeconds)");
  });

  it("keeps the daily voice quota dimension wired to the tier table", () => {
    const quotas = read("src/lib/tenant-quotas.ts");
    expect(quotas).toContain("voice_minutes_daily: voiceMinutesDailyQuotaForTier(plan)");
  });
});
