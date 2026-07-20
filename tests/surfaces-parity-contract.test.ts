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

describe("dial consent artifact on clients", () => {
  it("sends manual_attestation consentSource from web and native dial clients", () => {
    const web = read("src/components/OutboundDialDialog.tsx");
    const android = read("android/app/src/main/java/com/wireline/app/data/WirelineApi.kt");
    const ios = read("ios/Wireline/Networking/WirelineAPI.swift");
    expect(web).toContain('consentSource: "manual_attestation"');
    expect(android).toContain('body.put("consentSource", "manual_attestation")');
    expect(ios).toContain('consentSource: hasExpressWrittenConsent ? "manual_attestation" : nil');
  });
});

describe("MCP Cursor draft attribution", () => {
  it("resolves draftSource from oauth client redirect_uris", () => {
    const account = read("src/routes/chatgpt-mcp-account-routes.ts");
    const registry = read("src/lib/mcp-client-registry.ts");
    expect(account).toContain("wireline_mcp_oauth_clients");
    expect(account).toContain("mcpDraftSourceForClient(clientId, redirectUris)");
    expect(registry).toContain("redirectUris.some((uri) => isCursorRedirectUri(uri))");
  });
});
