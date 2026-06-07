import { describe, expect, it } from "vitest";
import {
  normalizeAppPageSubTabParam,
  resolveAppPageSubTabId,
  resolveAppPageSubTabRoute,
} from "./page-sub-tabs";
import { isMarketingPublicPath, isSessionOptionalPublicPath } from "./public-routes";

describe("page-sub-tabs", () => {
  const ops = resolveAppPageSubTabRoute("/ops")!;

  it("resolves ops tab aliases (actions → intel)", () => {
    expect(normalizeAppPageSubTabParam(ops, "actions")).toBe("intel");
    expect(resolveAppPageSubTabId(ops, "actions")).toBe("intel");
  });

  it("falls back to default tab for unknown params", () => {
    expect(resolveAppPageSubTabId(ops, "unknown")).toBe("floor");
    expect(resolveAppPageSubTabId(ops, null)).toBe("floor");
  });

  it("keeps canonical tab ids", () => {
    expect(resolveAppPageSubTabId(ops, "analytics")).toBe("analytics");
    expect(resolveAppPageSubTabId(ops, "intel")).toBe("intel");
  });
});

describe("public-routes", () => {
  it("treats core marketing paths as session-optional", () => {
    for (const path of ["/pricing", "/compare", "/about", "/showcase", "/support"]) {
      expect(isMarketingPublicPath(path)).toBe(true);
      expect(isSessionOptionalPublicPath(path)).toBe(true);
    }
  });

  it("includes vertical and blog paths", () => {
    expect(isMarketingPublicPath("/for/medical")).toBe(true);
    expect(isMarketingPublicPath("/blog/launch")).toBe(true);
  });

  it("keeps console routes session-dependent", () => {
    expect(isSessionOptionalPublicPath("/ops")).toBe(false);
    expect(isSessionOptionalPublicPath("/chat")).toBe(false);
  });
});
