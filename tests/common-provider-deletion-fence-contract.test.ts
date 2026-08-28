import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("common provider deletion-fence contract", () => {
  it("fences connected email and calendar mutations at their common boundary", () => {
    const source = read("src/lib/integrations.ts");
    const booking = source.slice(
      source.indexOf("async bookAppointment"),
      source.indexOf("async fetchInboxMessages"),
    );
    const email = source.slice(
      source.indexOf("async sendEmail"),
      source.indexOf("// --- Private Helpers"),
    );

    expect(booking).toContain("runTenantProviderWorkWithDeletionFence");
    expect(booking).toContain('operation: "integration_calendar_booking"');
    expect(booking).toContain("retainOnSuccess: () => providerWorkStarted");
    expect(booking.indexOf("runTenantProviderWorkWithDeletionFence")).toBeLessThan(
      booking.indexOf("createZoomMeeting"),
    );
    expect(booking.indexOf("runTenantProviderWorkWithDeletionFence")).toBeLessThan(
      booking.indexOf("createGoogleEvent"),
    );

    expect(email).toContain("runTenantProviderWorkWithDeletionFence");
    expect(email).toContain('operation: "integration_email_send"');
    expect(email).toContain("retainOnSuccess: () => providerWorkStarted");
    for (const providerCall of [
      "sendGoogleEmail",
      "sendMicrosoftEmail",
      "sendIcloudMail",
      "sendAgentMail",
      "sendPlatformEmail",
    ]) {
      expect(email.indexOf("runTenantProviderWorkWithDeletionFence")).toBeLessThan(
        email.indexOf(providerCall),
      );
    }
  });

  it("fences every public CRM mutation through one deletion-aware helper", () => {
    const source = read("src/lib/crm-service.ts");
    expect(source).toContain("private async runProviderMutation");
    expect(source).toContain("runTenantProviderWorkWithDeletionFence");
    expect(source).toContain("retainOnSuccess: () => providerWorkStarted");
    expect(source).toContain("CRM mutation blocked by terminal account deletion");
    for (const operation of [
      "crm_contact_create",
      "crm_lead_update",
      "crm_call_log",
      "crm_deal_stage_update",
      "crm_opportunity_create",
      "crm_enriched_lead_sync",
    ]) {
      expect(source).toContain(`this.runProviderMutation("${operation}"`);
    }
  });
});
