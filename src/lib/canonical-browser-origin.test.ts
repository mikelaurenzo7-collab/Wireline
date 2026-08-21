import { describe, expect, it } from "vitest";

import { canonicalLegacyBrowserHandoff } from "./canonical-browser-origin";

describe("legacy browser account-entry handoff", () => {
  it.each([
    ["/", "", "https://botbound.me/"],
    ["/signin", "?redirect=%2Fsettings", "https://botbound.me/signin?redirect=%2Fsettings"],
    [
      "/signup",
      "?plan=starter&interval=year",
      "https://botbound.me/signup?plan=starter&interval=year",
    ],
  ])("moves legacy %s to the canonical origin", (pathname, search, expected) => {
    expect(
      canonicalLegacyBrowserHandoff({
        origin: "https://trywireline.com",
        pathname,
        search,
      }),
    ).toBe(expected);
  });

  it.each([
    "https://botbound.me",
    "https://wireline-git-preview.vercel.app",
    "http://localhost:3000",
  ])("leaves non-legacy origin %s in place", (origin) => {
    expect(canonicalLegacyBrowserHandoff({ origin, pathname: "/signup", search: "" })).toBeNull();
  });

  it("never carries a fragment through the handoff", () => {
    const location = {
      origin: "https://trywireline.com",
      pathname: "/signup",
      search: "?plan=starter",
      hash: "#access-token",
    };

    expect(canonicalLegacyBrowserHandoff(location)).toBe("https://botbound.me/signup?plan=starter");
  });
});
