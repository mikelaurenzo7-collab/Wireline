import { describe, expect, it } from "vitest";
import { isMarketingPublicPath, isSessionOptionalPublicPath } from "./public-routes";

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
