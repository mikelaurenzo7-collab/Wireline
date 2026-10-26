import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { subscriptionPlanToTier } from "../src/lib/plan-entitlements";
import { resolveAgentEntitlement } from "../src/lib/agent-entitlements";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("entitlement fail-closed defaults", () => {
  it("maps Starter to personal quota tier, not business", () => {
    const source = read("src/lib/server-context.ts");
    expect(source).toContain("subscriptionPlanToTier(sub?.plan)");
    expect(subscriptionPlanToTier("starter")).toBe("personal");
    expect(subscriptionPlanToTier("business")).toBe("business");
    expect(subscriptionPlanToTier("pro")).toBe("business");
    expect(subscriptionPlanToTier(undefined)).toBe("free");
  });

  it("treats missing subscription status as pending_activation on live paths", () => {
    const outbound = read("src/lib/voice/outbound-call-service.ts");
    const phoneLines = read("src/lib/phone-line-entitlements.ts");
    const agents = read("src/lib/agent-entitlements.ts");
    const channels = read("src/lib/channel-entitlements.ts");

    expect(outbound).toContain('settings?.subscriptionStatus !== "active"');
    expect(phoneLines).toContain("getTenantChannelEntitlements(userId, executor)");
    expect(phoneLines).toContain('if (entitlement.subscriptionStatus !== "active") return 0');
    expect(channels).toContain('row?.status ?? "pending_activation"');
    expect(agents).toContain('status?.trim().toLowerCase() || "pending_activation"');
    expect(
      resolveAgentEntitlement({
        isOwner: false,
        planId: "voice-high",
        subscriptionStatus: undefined,
        maxAgents: 99,
        extraAgents: 10,
      }),
    ).toMatchObject({
      subscriptionStatus: "pending_activation",
      effectiveCap: null,
      unlimited: true,
    });

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
