import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "src/routes/post-call-output-routes.ts"), "utf8");
const digest = readFileSync(resolve(process.cwd(), "src/lib/post-call-digest.ts"), "utf8");

describe("post-call report destination availability", () => {
  it("requires an active grant and configured provider before offering storage", () => {
    expect(route).toContain("active: schema.crmConnections.active");
    expect(route).toContain("rows.filter((row) => row.active !== false)");
    expect(route).toContain('providers.has("google_sheets") && googleSheetsConfigured()');
    expect(route).toContain('providers.has("microsoft_excel") && microsoftGraphConfigured()');
    expect(route).toContain("google_drive: googleSheetsConnected");
    expect(route).toContain("onedrive: microsoftExcelConnected");
  });
});

describe("post-call CRM identity boundary", () => {
  it("keeps call details in BotBound without creating or queueing an ANI-linked CRM record", () => {
    const start = digest.indexOf("function syncPostCallCrm(");
    const end = digest.indexOf("async function publishPostCallRecap(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const effect = digest.slice(start, end);

    expect(effect).toContain("logged: false, queuedForApproval: false");
    expect(effect).not.toContain("CRMService");
    expect(effect).not.toContain("executeAction");
    expect(effect).not.toContain("drizzle");
    // With no CRM integration, the owner's digest carries no CRM status line:
    // "CRM not updated" on every email read like an error.
    expect(digest).not.toContain("CRM not updated");
    expect(digest).not.toContain("crmDigestStatusLine");
    expect(digest).not.toContain("No CRM connected, connect HubSpot or Salesforce to auto-log.");
  });
});
