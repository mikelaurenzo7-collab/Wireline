import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/runtime-integrations-registry.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const compactSource = source.replace(/\s+/g, " ");

describe("runtime integrations registry launch policy", () => {
  it("presents OpenAI as the required structured and live voice runtime", () => {
    expect(source).toContain('"openai",\n    "OpenAI",');
    expect(source).toContain(
      "Managed structured runtime and OpenAI Realtime for every browser and PSTN voice session.",
    );
    expect(source).toContain("OpenAI Realtime");
    expect(compactSource).toMatch(/item\(\s*"openai".{0,500}?, true,/);
    expect(source).not.toMatch(/api\.x\.ai|api\.vapi\.ai/i);
  });

  it("marks the monetized communications control plane as required", () => {
    for (const integration of ["openai", "twilio", "stripe", "resend", "upstash"]) {
      expect(compactSource).toMatch(new RegExp(`item\\(\\s*"${integration}".{0,700}?, true,`));
    }
  });

  it("reports signed Resend feedback separately from the required send transport", () => {
    expect(compactSource).toContain('"resend-feedback", "Resend delivery feedback",');
    expect(source).toContain("RESEND_WEBHOOK_SECRET");
    expect(compactSource).toMatch(/item\(\s*"resend-feedback".{0,700}?, false,/);
    expect(source).toContain("validate: resendWebhookSecretConfigured");
    expect(source).toContain(
      "Email sending remains available, but provider delivery risk and failure evidence are incomplete.",
    );
  });

  it("treats whitespace-only environment values as missing", () => {
    expect(source).toContain('typeof value === "string" && value.trim().length > 0');
  });

  it("keeps WhatsApp claims bounded", () => {
    expect(source).toContain("WhatsApp remains private beta");
  });

  it("keeps workspace and Yahoo capability claims bounded to implemented behavior", () => {
    expect(source).toContain('"Gmail, Calendar, Drive, and Sheets."');
    expect(source).not.toContain("Gmail, Calendar, Contacts, Drive, and Sheets.");
    expect(source).toContain('"Outlook, Calendar, Teams, Excel, and OneDrive."');
    expect(source).not.toContain("OneDrive, and PowerPoint.");
    expect(source).toContain('"Yahoo"');
    expect(source).toContain(
      "Yahoo sign-in is supported. Yahoo Mail read and send actions are not yet available.",
    );
  });
});
