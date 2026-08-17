import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("work companions are fully removed", () => {
  it("deletes the companion runtime, routes, docs, and tests", () => {
    for (const path of [
      "src/lib/work-companion-runtime.ts",
      "src/routes/work-companion-routes.ts",
      "docs/GROK_BOT_COMPANION_RUNTIME.md",
      "tests/work-companion-runtime.test.ts",
    ]) {
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(false);
    }
  });

  it("unmounts companion routes and does not inject companion prep into PSTN", () => {
    const registry = read("src/server/register-api-routes.ts");
    const vapi = read("src/lib/vapi-client.ts");
    const campaigns = read("src/components/outbound/CampaignsPanel.tsx");
    const identity = read("src/pages/LiveVideoStudioPage.tsx");

    expect(registry).not.toContain("workCompanionRouter");
    expect(registry).not.toContain("work-companion-routes");
    expect(vapi).not.toContain("loadWorkCompanionCallPrep");
    expect(vapi).not.toContain("work-companion-runtime");
    expect(campaigns).not.toContain("/api/work-companions");
    expect(campaigns).not.toContain("Draft call prep");
    expect(identity).not.toContain("Call prep on campaigns");
  });

  it("keeps customer copy and env inventory free of work companions", () => {
    const privacy = read("src/components/PrivacyPolicyPage.tsx");
    const envExample = read(".env.example");
    const docsIndex = read("docs/README.md");

    expect(privacy).not.toContain("work companions");
    expect(envExample).not.toContain("work companions");
    expect(docsIndex).not.toContain("GROK_BOT_COMPANION_RUNTIME.md");
    expect(read("docs/GROK_LIVE_VOICE.md")).toContain("There is no work-companion API");
  });
});
