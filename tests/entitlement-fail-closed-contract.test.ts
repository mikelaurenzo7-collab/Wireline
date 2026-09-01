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
    const outbound = read("src/lib/voice/outbound-call-service.ts");
    const phoneLines = read("src/lib/phone-line-entitlements.ts");
    const agents = read("src/lib/agent-entitlements.ts");

    expect(outbound).toContain('settings?.subscriptionStatus !== "active"');
    expect(phoneLines).toContain('settings?.subscriptionStatus ?? "pending_activation"');
    expect(agents).toContain('status?.trim().toLowerCase() || "pending_activation"');

    for (const [path, source] of [
      ["src/lib/voice/outbound-call-service.ts", outbound],
      ["src/lib/phone-line-entitlements.ts", phoneLines],
      ["src/lib/agent-entitlements.ts", agents],
    ] as const) {
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
