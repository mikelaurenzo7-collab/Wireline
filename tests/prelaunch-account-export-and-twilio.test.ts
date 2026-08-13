import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_EXPORT_SECURITY_ONLY_TABLES,
  isSensitiveAccountExportField,
  redactAccountExportValue,
} from "../src/lib/account-export";
import {
  copyTwilioSettingsRecord,
  normalizeTwilioMessagingServiceSid,
  normalizeTwilioPhoneSetting,
} from "../src/lib/twilio-settings";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("strict prelaunch account export and Twilio contracts", () => {
  it("redacts usable provider credentials without deleting usage metrics", () => {
    const exported = redactAccountExportValue({
      access_token: "oauth-access",
      fcm_token: "push-registration-token",
      idToken: "oauth-id-token",
      refreshToken: "oauth-refresh",
      password_hash: "password-hash",
      secret: "webhook-secret",
      secret_last_four: "1234",
      input_tokens: 42,
      nested: { client_secret: "client-secret", outputTokens: 9 },
    });

    expect(exported).toEqual({
      secret_last_four: "1234",
      input_tokens: 42,
      nested: { outputTokens: 9 },
    });
    expect(isSensitiveAccountExportField("vapi_private_key")).toBe(true);
    expect(isSensitiveAccountExportField("apns_voip_token")).toBe(true);
    expect(isSensitiveAccountExportField("fcm_token")).toBe(true);
    expect(isSensitiveAccountExportField("cache_create_tokens")).toBe(false);
    expect(isSensitiveAccountExportField("inputTokens")).toBe(false);
  });

  it("preserves malformed settings bodies for the canonical validator", () => {
    expect(copyTwilioSettingsRecord(null)).toBeUndefined();
    expect(copyTwilioSettingsRecord("invalid")).toBeUndefined();
    expect(copyTwilioSettingsRecord(["invalid"])).toBeUndefined();

    const original = { twilio_sms_from_number: "+14155550123" };
    const copied = copyTwilioSettingsRecord(original);
    expect(copied).toEqual(original);
    expect(copied).not.toBe(original);
  });

  it("never downloads short-lived authentication artifacts", () => {
    for (const table of [
      "wireline_browser_handoffs",
      "wireline_mcp_access_tokens",
      "wireline_mcp_oauth_codes",
      "wireline_mcp_refresh_tokens",
      "wireline_oauth_pending_codes",
      "wireline_password_reset_tokens",
    ]) {
      expect(ACCOUNT_EXPORT_SECURITY_ONLY_TABLES.has(table)).toBe(true);
    }
  });

  it("normalizes Twilio destinations to E.164 and rejects TwiML-shaped input", () => {
    expect(normalizeTwilioPhoneSetting(" whatsapp:+14155550123 ", "WhatsApp sender")).toBe(
      "+14155550123",
    );
    expect(normalizeTwilioPhoneSetting("+1 415 555 0123", "SMS sender")).toBe("+14155550123");
    expect(normalizeTwilioPhoneSetting("+1 (415) 555-0123", "Manager alert number")).toBe(
      "+14155550123",
    );
    expect(normalizeTwilioPhoneSetting("   ", "Manager alert number")).toBeNull();
    expect(() =>
      normalizeTwilioPhoneSetting("+14155550123</Dial><Say>injected</Say>", "Fallback number"),
    ).toThrow(/E\.164/);
    expect(() => normalizeTwilioPhoneSetting("14155550123", "Fallback number")).toThrow(/E\.164/);
  });

  it("validates Twilio Messaging Service identifiers", () => {
    expect(normalizeTwilioMessagingServiceSid(`MG${"a".repeat(32)}`)).toBe(`MG${"a".repeat(32)}`);
    expect(() => normalizeTwilioMessagingServiceSid("SM123")).toThrow(/must start with MG/);
  });

  it("prefers scoped API keys for Twilio REST while retaining the webhook token fallback", () => {
    const source = read("src/lib/twilio-service-base.ts");
    const escalation = read("src/routes/escalation-routes.ts");
    expect(source).toContain('env("TWILIO_API_KEY")');
    expect(source).toContain('env("TWILIO_API_SECRET")');
    expect(source).toContain("twilio(apiKey, apiSecret, { accountSid })");
    expect(source).toContain('env("TWILIO_AUTH_TOKEN")');
    expect(source).toContain('TwilioRestAuthMode = "api_key" | "auth_token" | "unconfigured"');
    expect(escalation).toContain(
      'import { sendPlatformOperationalAlert } from "../lib/twilio-service-base"',
    );
    expect(escalation).not.toContain("client.messages.create");
    expect(source).toContain("const client = getTwilioClient()");
    expect(escalation).not.toContain("twilio(sid, token)");
  });

  it("registers both terminal guards before the legacy settings router", () => {
    const registration = read("src/server/register-api-routes.ts");
    const settings = registration.indexOf("app.use(settingsRouter)");
    expect(registration.indexOf("app.use(settingsPhoneGuardRouter)")).toBeGreaterThan(-1);
    expect(registration.indexOf("app.use(accountExportGuardRouter)")).toBeGreaterThan(-1);
    expect(registration.indexOf("app.use(settingsPhoneGuardRouter)")).toBeLessThan(settings);
    expect(registration.indexOf("app.use(accountExportGuardRouter)")).toBeLessThan(settings);
  });

  it("derives export coverage from the audited deletion registry without a duplicate route", () => {
    const route = read("src/routes/account-export-guard-routes.ts");
    expect(route).toContain("ACCOUNT_DELETION_TARGETS");
    expect(route).toContain("ACCOUNT_EXPORT_SECURITY_ONLY_TABLES");
    expect(route).toContain("redactAccountExportValue");
    expect(route).toContain("SELECT * FROM wireline_users");
    expect(route).toContain('bucket: "api:account-export"');
    expect(route).toContain('res.setHeader("Cache-Control", "private, no-store")');
    expect(route).toContain('router.use(\n  "/api/account/export"');
    expect(route).not.toContain('router.post(\n  "/api/account/export"');
    expect(route).not.toContain("jobsRateLimit");
    expect(route).toContain('source_registry: "ACCOUNT_DELETION_TARGETS"');
    expect(route).toContain("sql.join(predicates, sql` OR `)");
  });

  it("keeps the historical training archive in tenant-scoped exports", () => {
    const migration = read("drizzle/migrations/0087_launch_integrity_reconciliation.sql");
    expect(migration).toContain("wireline_training_backup_20260609");
    expect(migration).toContain("GRANT SELECT");
    expect(migration).toContain("TO wireline_server");
    expect(migration).toContain("tenant_export_select");
    expect(migration).toContain("wireline_current_user_id()");
  });
});
