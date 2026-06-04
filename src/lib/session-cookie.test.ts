import { describe, expect, it } from "vitest";
import { getSessionTokenFromRequest, parseCookieHeader } from "./session-cookie";

describe("session-cookie", () => {
  it("parses cookie header", () => {
    expect(parseCookieHeader("wireline_session=abc123; other=1")).toEqual({
      wireline_session: "abc123",
      other: "1",
    });
  });

  it("prefers Authorization bearer over cookie", () => {
    const req = {
      headers: {
        authorization: "Bearer header-token",
        cookie: "wireline_session=cookie-token",
      },
    } as Parameters<typeof getSessionTokenFromRequest>[0];
    expect(getSessionTokenFromRequest(req)).toBe("header-token");
  });

  it("reads token from session cookie when no bearer", () => {
    const req = {
      headers: { cookie: "wireline_session=cookie-token" },
    } as Parameters<typeof getSessionTokenFromRequest>[0];
    expect(getSessionTokenFromRequest(req)).toBe("cookie-token");
  });
});
