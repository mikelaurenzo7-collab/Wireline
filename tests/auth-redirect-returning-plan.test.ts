import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readRedirectFromSearch } from "../src/lib/auth-redirect";

const source = () => readFileSync(resolve(process.cwd(), "src/lib/auth-redirect.ts"), "utf8");

describe("post-auth destination contract", () => {
  it("preserves an explicit safe internal return target", () => {
    expect(readRedirectFromSearch("?redirect=%2Fsettings%3Ftab%3Dbilling")).toBe(
      "/settings?tab=billing",
    );
  });

  it("rejects external and protocol-relative return targets", () => {
    expect(readRedirectFromSearch("?redirect=https%3A%2F%2Fevil.example")).toBeNull();
    expect(readRedirectFromSearch("?redirect=%2F%2Fevil.example")).toBeNull();
  });

  it("sends every fresh signup into the same one-workspace Bot Studio", () => {
    const authRedirect = source();
    expect(authRedirect).toContain('return "/studio?create=1"');
    expect(authRedirect).not.toContain('posture=business');
  });

  it("keeps returning paid intent routing on billing without changing workspace identity", () => {
    const authRedirect = source();
    expect(authRedirect).toContain('return `/settings/billing?${params.toString()}`');
    expect(authRedirect).toContain('if (plan && plan !== "personal") return "business"');
    expect(authRedirect).not.toContain('return "/studio?create=1&posture=business"');
  });

  it("defaults returning users to Overview", () => {
    expect(source()).toMatch(/return "\/overview";\s*\n}\s*$/);
  });
});
