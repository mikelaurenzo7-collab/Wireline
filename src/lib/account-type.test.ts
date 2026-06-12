import { describe, expect, it } from "vitest";
import {
  resolveAccountType,
  accountNavGroups,
  accountSidebarItems,
  isRouteAvailableForAccount,
} from "./account-type";

describe("account-type", () => {
  it("resolves only the personal tier to a personal account", () => {
    expect(resolveAccountType("personal")).toBe("personal");
    for (const plan of ["starter", "pro", "business", "enterprise"]) {
      expect(resolveAccountType(plan)).toBe("business");
    }
  });

  it("defaults unknown / unloaded plans to business (never strip an established workspace)", () => {
    expect(resolveAccountType(null)).toBe("business");
    expect(resolveAccountType(undefined)).toBe("business");
    expect(resolveAccountType("")).toBe("business");
  });

  it("business mode sees the full nav unchanged", () => {
    expect(accountNavGroups("business").map((g) => g.label)).toEqual([
      "Studio",
      "Command",
      "Channels",
      "Admin",
    ]);
  });

  it("personal mode hides the business-only Command group", () => {
    expect(accountNavGroups("personal").map((g) => g.label)).toEqual([
      "Studio",
      "Channels",
      "Admin",
    ]);
  });

  it("personal rail keeps Studio + Channels, drops Command's run surfaces", () => {
    const paths = accountSidebarItems("personal").map((i) => i.path);
    expect(paths).toEqual(["/agents", "/chat", "/training", "/phone", "/email", "/sms"]);
    expect(paths).not.toContain("/ops");
    expect(paths).not.toContain("/insights");
    expect(paths).not.toContain("/pipeline");
  });

  it("business rail is the full nine-item list", () => {
    expect(accountSidebarItems("business").map((i) => i.path)).toEqual([
      "/agents",
      "/chat",
      "/training",
      "/ops",
      "/insights",
      "/pipeline",
      "/phone",
      "/email",
      "/sms",
    ]);
  });

  it("gates routes by mode but leaves unknown/admin paths reachable", () => {
    expect(isRouteAvailableForAccount("personal", "/agents")).toBe(true);
    expect(isRouteAvailableForAccount("personal", "/ops")).toBe(false);
    expect(isRouteAvailableForAccount("personal", "/pipeline")).toBe(false);
    expect(isRouteAvailableForAccount("personal", "/admin")).toBe(true);
    expect(isRouteAvailableForAccount("business", "/ops")).toBe(true);
  });
});
