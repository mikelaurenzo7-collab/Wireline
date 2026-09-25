import { describe, expect, it } from "vitest";

import { canonicalLegacyBrowserHandoff } from "./canonical-browser-origin";

describe.each(["https://trywireline.com", "https://botbound.me"])(
  "legacy browser account-entry handoff from %s",
  (legacyOrigin) => {
    it.each([
      ["/", "", "https://botbound.app/"],
      ["/signin", "?redirect=%2Fsettings", "https://botbound.app/signin?redirect=%2Fsettings"],
      [
        "/signup",
        "?plan=starter&interval=year",
        "https://botbound.app/signup?plan=starter&interval=year",
      ],
    ])("moves legacy %s to the canonical origin", (pathname, search, expected) => {
      expect(
        canonicalLegacyBrowserHandoff({
          origin: legacyOrigin,
          pathname,
          search,
        }),
      ).toBe(expected);
    });

    it.each([
      "https://botbound.app",
      "https://botbound.me.attacker.example",
      "http://botbound.me",
      "https://wireline-git-preview.vercel.app",
      "http://localhost:3000",
    ])("leaves non-legacy origin %s in place", (origin) => {
      expect(canonicalLegacyBrowserHandoff({ origin, pathname: "/signup", search: "" })).toBeNull();
    });

    it("preserves a browser-only fragment through the handoff", () => {
      const location = {
        origin: legacyOrigin,
        pathname: "/reset-password",
        search: "",
        hash: "#token=reset-token",
      };

      expect(canonicalLegacyBrowserHandoff(location)).toBe(
        "https://botbound.app/reset-password#token=reset-token",
      );
    });

    it.each([
      "/auth/oauth-complete",
      "/auth/oauth-complete/",
      "/oauth-complete",
      "/oauth-complete/",
      "/api/auth/google/callback",
      "/api/oauth/google/callback",
    ])("keeps host-bound route %s on the legacy origin", (pathname) => {
      expect(
        canonicalLegacyBrowserHandoff({
          origin: legacyOrigin,
          pathname,
          search: "?code=provider-code",
          hash: "#code=bridge-code",
        }),
      ).toBeNull();
    });
  },
);
