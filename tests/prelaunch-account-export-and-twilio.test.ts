import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_EXPORT_SECURITY_ONLY_TABLES,
  isSensitiveAccountExportField,
  redactAccountExportValue,
} from "../src/lib/account-export";
import {
  normalizeTwilioMessagingServiceSid,
  normalizeTwilioPhoneSetting,
} from "../src/lib/twilio-settings";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("strict prelaunch account export and Twilio contracts", () => {
  it("redacts usable provider credentials without deleting usage metrics", () => {
    const exported = redactAccountExportValue({
      access_token: "oauth-access",
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
    expect(isSensitiveAccountExportField("cache_create_tokens")).toBe(false);
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
    expect(normalizeTwilioPhoneSetting("   ", "Manager alert number")).toBeNull();
    expect(() =>
      normalizeTwilioPhoneSetting("+14155550123</Dial><Say>injected</Say>", "Fallback number"),
    ).toThrow(/E\.164/);
    expect(() => normalizeTwilioPhoneSetting("14155550123", "Fallback number")).toThrow(/E\.164/);
  });

  it("validates Twilio Messaging Service identifiers", () => {
    expect(normalizeTwilioMessagingServiceSid(`MG${"a".repeat(32)}`)).toBe(
      `MG${"a".repeat(32)}`,
    );
    expect(() => normalizeTwilioMessagingServiceSid("SM123")).toThrow(/must start with MG/);
  });

  it("registers both terminal guards before the legacy settings router", () => {
    const registration = read("src/server/register-api-routes.ts");
    const settings = registration.indexOf("app.use(settingsRouter)");
    expect(registration.indexOf("app.use(settingsPhoneGuardRouter)")).toBeGreaterThan(-1);
    expect(registration.indexOf("app.use(accountExportGuardRouter)")).toBeGreaterThan(-1);
    expect(registration.indexOf("app.use(settingsPhoneGuardRouter)")).toBeLessThan(settings);
    expect(registration.indexOf("app.use(accountExportGuardRouter)")).toBeLessThan(settings);
  });

  it("derives export coverage from the audited deletion registry", () => {
    const route = read("src/routes/account-export-guard-routes.ts");
    expect(route).toContain("ACCOUNT_DELETION_TARGETS");
    expect(route).toContain("ACCOUNT_EXPORT_SECURITY_ONLY_TABLES");
    expect(route).toContain("redactAccountExportValue");
    expect(route).toContain("SELECT * FROM wireline_users");
    expect(route).toContain('bucket: "api:account-export"');
    expect(route).not.toContain("jobsRateLimit");
    expect(route).toContain("source_registry: \"ACCOUNT_DELETION_TARGETS\"");
    expect(route).toContain("sql.join(predicates, sql` OR `)");
  });
});
