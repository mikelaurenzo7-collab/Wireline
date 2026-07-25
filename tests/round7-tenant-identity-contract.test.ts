import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("round-7 shared-provider tenant identity", () => {
  it("scopes the Vapi number listing to lines the caller owns", () => {
    // One shared Vapi account holds every tenant's line, so the raw upstream
    // list is a directory of every customer's business number plus the id that
    // outbound dialing and inbound routing key off.
    const carrier = read("src/routes/carrier-routes.ts");
    const handler = carrier.slice(carrier.indexOf('"/api/carrier/numbers"'));
    expect(handler).toContain("schema.phoneNumbers.userId, req.user.id");
    expect(handler).toContain("ownedVapiIds");
    // The upstream array must be narrowed to owned lines BEFORE it is shaped
    // into the response — filtering after mapping would still have serialized
    // every tenant's number.
    expect(handler).toMatch(
      /\.filter\(\(num\) => ownedVapiIds\.has\(num\.id\) \|\| ownedNumbers\.has\(num\.number\)\)\s*\n\s*\.map\(/,
    );
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
    expect(fn).toContain("403");
  });

  it("settles the daily voice burst cap with minutes actually consumed", () => {
    // Every assertOutboundVoiceAllowed call site passes units: 0, so the
    // pre-dial checkAndIncrement never advances the counter and
    // VOICE_BURST_DAILY could not fire. The settle happens post-call instead.
    const usage = read("src/lib/voice-usage.ts");
    expect(usage).toContain('checkAndIncrement(userId, "voice_minutes_daily", minutes)');

    const control = read("src/lib/voice-spend-control.ts");
    expect(control).toContain('"voice_minutes_daily"');

    // Guard the regression: if a future change starts reserving units at dial
    // time, this pairing is what keeps the counter honest rather than double
    // counting. Assert the settle site still derives from billable minutes.
    expect(usage).toContain("const minutes = billableVoiceMinutes(durationSeconds)");
  });

  it("keeps the daily voice quota dimension wired to the tier table", () => {
    const quotas = read("src/lib/tenant-quotas.ts");
    expect(quotas).toContain("voice_minutes_daily: voiceMinutesDailyQuotaForTier(plan)");
  });
});
