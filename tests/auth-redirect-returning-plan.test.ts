import { describe, expect, it } from "vitest";
import { destinationAfterAuth } from "../src/lib/auth-redirect";

describe("destinationAfterAuth", () => {
  it("preserves an explicit safe return target", () => {
    expect(
      destinationAfterAuth({
        redirectTo: "/settings?tab=billing",
        isNewUser: false,
        hasAgents: true,
      }),
    ).toBe("/settings?tab=billing");
  });

  it("rejects external and protocol-relative return targets", () => {
    expect(
      destinationAfterAuth({ redirectTo: "https://evil.example", isNewUser: false, hasAgents: true }),
    ).toBe("/overview");
    expect(
      destinationAfterAuth({ redirectTo: "//evil.example", isNewUser: false, hasAgents: true }),
    ).toBe("/overview");
  });

  it("sends every fresh signup into the same one-workspace Bot Studio", () => {
    const destination = destinationAfterAuth({
      isNewUser: true,
      hasAgents: false,
    });

    expect(destination).toBe("/studio?create=1");
    expect(destination).not.toContain("posture=");
  });

  it("sends returning users with no Bots into the unified create flow", () => {
    expect(
      destinationAfterAuth({
        isNewUser: false,
        hasAgents: false,
      }),
    ).toBe("/studio?create=1");
  });

  it("sends returning users with Bots to Overview", () => {
    expect(
      destinationAfterAuth({
        isNewUser: false,
        hasAgents: true,
      }),
    ).toBe("/overview");
  });
});
