import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("entitlement fail-closed defaults", () => {
  it("maps Starter to personal quota tier, not business", () => {
    const source = read("src/lib/server-context.ts");
    // Starter must not share the business case arm.
    expect(source).toMatch(/case "business":\s*\n\s*case "pro":/);
    expect(source).not.toMatch(/case "business":\s*\n\s*case "starter":/);
    expect(source).toContain('case "starter":');
    expect(source).toContain('return "personal";');
  });

  it("treats missing subscription status as pending_activation on live paths", () => {
    for (const path of [
      "src/lib/vapi-client.ts",
      "src/routes/vapi-v2.ts",
      "src/lib/phone-line-entitlements.ts",
      "src/lib/agent-entitlements.ts",
    ]) {
      const source = read(path);
      expect(source, path).toContain("pending_activation");
      expect(source, path).not.toMatch(/subscriptionStatus\s*\|\|\s*"active"/);
      expect(source, path).not.toMatch(/subscriptionStatus\s*\?\?\s*"active"/);
    }
  });

  it("routes post-call CSAT SMS through the shared outbound dial gate", () => {
    const source = read("src/lib/csat-service.ts");
    expect(source).toContain("evaluateOutboundDialGate");
    expect(source).toContain("isLiveSessionFollowUp: true");
  });
});
