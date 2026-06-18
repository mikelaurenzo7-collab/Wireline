import { describe, expect, it } from "vitest";
import {
  resolveAccountType,
  accountNavGroups,
  accountSidebarItems,
  isRouteAvailableForAccount,
} from "./account-type";

describe("account-type", () => {
  it("resolves only the personal and personal-plus tiers to a personal account", () => {
    expect(resolveAccountType("personal")).toBe("personal");
    expect(resolveAccountType("personal-plus")).toBe("personal");
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
      "Build",
      "Run",
      "Channels",
      "Admin",
    ]);
  });

  it("personal mode hides the business-only Run group", () => {
    expect(accountNavGroups("personal").map((g) => g.label)).toEqual([
      "Personal",
      "Build",
      "Admin",
    ]);
  });

  it("personal rail keeps Build + Channels, drops Run's surfaces", () => {
    const paths = accountSidebarItems("personal").map((i) => i.path);
    expect(paths).toEqual(["/personal-home", "/agents", "/training"]);
    expect(paths).not.toContain("/ops");
    expect(paths).not.toContain("/insights");
    expect(paths).not.toContain("/pipeline");
  });

  it("business rail is the full run + channels list", () => {
    expect(accountSidebarItems("business").map((i) => i.path)).toEqual([
      "/agents",
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
