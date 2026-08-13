import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { getSessionTokenFromRequest, hasBearerAuthorization } from "../src/lib/session-cookie";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function requestWith(headers: Record<string, string | undefined>): Request {
  return { headers } as unknown as Request;
}

/**
 * /api/mobile/* skips the same-origin CSRF check because it believes the
 * request authenticates with a bearer token. That belief is only safe when
 * the CSRF gate and the session-token reader agree exactly on what counts as
 * a bearer — a tolerant gate plus a strict reader let
 * `Authorization: bearer x` + the victim's session cookie authenticate as the
 * cookie user on a spend-causing route with no origin check applied.
 */
describe("mobile bearer / CSRF exemption alignment", () => {
  it("uses one shared bearer definition in the same-origin middleware", () => {
    const middleware = read("src/middleware/same-origin.ts");
    expect(middleware).toContain('import { hasBearerAuthorization } from "../lib/session-cookie"');
    expect(middleware).not.toMatch(/function hasBearerAuthorization/);
  });

  it("never falls back to the session cookie when any Authorization header is present", () => {
    const cookieHeader = "wireline_session=victim-cookie-token";

    // Well-formed bearer: reader returns the bearer, not the cookie.
    expect(
      getSessionTokenFromRequest(
        requestWith({ authorization: "Bearer real-token", cookie: cookieHeader }),
      ),
    ).toBe("real-token");

    // Case/spacing variants the CSRF gate accepts must resolve to the SAME
    // credential the reader uses — and never to the cookie.
    for (const header of ["bearer forged", "BEARER forged", "Bearer\tforged"]) {
      const req = requestWith({ authorization: header, cookie: cookieHeader });
      expect(hasBearerAuthorization(req), header).toBe(true);
      expect(getSessionTokenFromRequest(req), header).toBe("forged");
    }

    // Malformed Authorization values fail closed instead of using the cookie.
    for (const header of ["Bearer", "Bearer ", "Basic abc", "Token x"]) {
      const req = requestWith({ authorization: header, cookie: cookieHeader });
      expect(getSessionTokenFromRequest(req), header).toBeUndefined();
    }

    // No Authorization header at all: cookie auth works as before.
    expect(getSessionTokenFromRequest(requestWith({ cookie: cookieHeader }))).toBe(
      "victim-cookie-token",
    );
  });

  it("keeps gate and reader classifications identical across header shapes", () => {
    const shapes = [
      "Bearer token",
      "bearer token",
      "BEARER token",
      "Bearer  token",
      "Bearer\ttoken",
      "Bearer",
      "Bearer ",
      "Basic abc",
      "",
    ];
    for (const header of shapes) {
      const req = requestWith({ authorization: header || undefined });
      const gateSaysBearer = hasBearerAuthorization(req);
      const readerToken = getSessionTokenFromRequest(req);
      // Whenever the gate exempts the request as bearer-authenticated, the
      // reader must produce a bearer credential (not undefined-then-cookie).
      if (gateSaysBearer) {
        expect(readerToken, header).toBeDefined();
      }
    }
  });
});
