import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("mobile outbound consent parity", () => {
  it("requires the same marketing consent artifact as web dial", () => {
    const mobile = read("src/routes/mobile-routes.ts");
    const web = read("src/routes/outbound-routes.ts");

    expect(web).toContain("CONSENT_ARTIFACT_REQUIRED");
    expect(mobile).toContain("CONSENT_ARTIFACT_REQUIRED");
    expect(mobile).toContain('consentSource: z.enum(["web_form", "lead_import", "crm", "manual_attestation"])');
    expect(mobile).toContain("consentLeadId");
    expect(mobile).toContain("expressConsent && !consentSource && !consentLeadId");
  });
});

describe("browser handoff runtime grants", () => {
  it("grants wireline_server when ensureBrowserHandoffSchema creates the table", () => {
    const source = read("src/routes/browser-handoff-routes.ts");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS wireline_browser_handoffs");
    expect(source).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wireline_browser_handoffs TO wireline_server",
    );
  });
});
