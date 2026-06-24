import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const routeSource = read("src/routes/chatgpt-mcp-routes.ts");
const appSource = read("src/lib/chatgpt-mcp.ts");
const rolloutDocs = read("docs/CHATGPT_APP.md");
const submissionPacket = read("docs/CHATGPT_APP_SUBMISSION.md");

describe("Wireline ChatGPT App production contract", () => {
  it("publishes the required MCP and OAuth discovery surfaces", () => {
    expect(routeSource).toContain('router.post("/mcp"');
    expect(routeSource).toContain('"/.well-known/oauth-protected-resource"');
    expect(routeSource).toContain('"/.well-known/oauth-authorization-server"');
    expect(routeSource).toContain("client_id_metadata_document_supported: true");
    expect(routeSource).toContain('code_challenge_method: "S256"');
  });

  it("keeps guest demos temporary and voice previews tool-free", () => {
    expect(appSource).toContain("expiresAt: issuedAt + 60 * 60 * 1000");
    expect(routeSource).toContain("toolChoice: \"none\"");
    expect(routeSource).toContain("tools: []");
    expect(routeSource).toContain("chatgpt-demo-voice");
  });

  it("requires account connection and explicit confirmation before a draft is created", () => {
    expect(routeSource).toContain('requireScope(principal, "agents.write")');
    expect(routeSource).toContain("args.confirmed !== true");
    expect(routeSource).toContain('status: "draft"');
    expect(routeSource).toContain("unlaunched Wireline draft");
  });

  it("states the ChatGPT-to-Wireline conversion boundary consistently", () => {
    expect(rolloutDocs).toContain("No live launch without a separate confirmation inside Wireline.");
    expect(submissionPacket).toContain("No agent launch.");
    expect(submissionPacket).toContain("No outbound or inbound calling from the ChatGPT app.");
    expect(submissionPacket).toContain("OAuth authorization code flow with PKCE `S256`.");
  });
});
