import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public landmark integrity", () => {
  it("lets MarketingChrome own the single main landmark", () => {
    const chrome = read("src/components/marketing/MarketingChrome.tsx");
    expect(chrome).toContain('<main\n        id="main-content"');

    for (const path of [
      "src/pages/OAuthComplete.tsx",
      "src/pages/AcceptInvite.tsx",
      "src/components/Status.tsx",
    ]) {
      const surface = read(path);
      expect(surface).toContain("<MarketingChrome");
      expect(surface).not.toContain('<main id="main-content"');
      expect(surface).not.toContain('id="main-content"');
    }
  });

  it("keeps every /signup/* route in account-creation mode", () => {
    const portal = read("src/components/AuthPortal.tsx");
    expect(portal).toContain('location.pathname.startsWith("/signup/")');
  });
});
