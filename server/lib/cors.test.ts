import { describe, expect, it } from "vitest";

import { buildCorsOptions } from "./cors";

describe("buildCorsOptions", () => {
  it("returns null for an empty allowlist (CORS disabled)", () => {
    expect(buildCorsOptions([])).toBeNull();
  });

  it("allows exact origins and rejects others", () => {
    const opts = buildCorsOptions(["https://app.example.com"]);
    expect(opts).not.toBeNull();
    const origin = opts!.origin as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void
    ) => void;

    let result: { err: Error | null; allow?: boolean } | undefined;
    origin("https://app.example.com", (err, allow) => {
      result = { err, allow };
    });
    expect(result?.err).toBeNull();
    expect(result?.allow).toBe(true);

    origin("https://evil.example.com", (err, allow) => {
      result = { err, allow };
    });
    expect(result?.err).toBeInstanceOf(Error);
    expect(result?.allow).toBeUndefined();
  });

  it("allows undefined origin (same-origin / non-browser requests)", () => {
    const opts = buildCorsOptions(["https://app.example.com"]);
    const origin = opts!.origin as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void
    ) => void;
    let allowed = false;
    origin(undefined, (err, allow) => {
      allowed = !err && !!allow;
    });
    expect(allowed).toBe(true);
  });

  it("disables credentials when wildcard is present (browser spec)", () => {
    const opts = buildCorsOptions(["*"]);
    expect(opts!.credentials).toBe(false);
  });

  it("enables credentials for explicit origin allowlists", () => {
    const opts = buildCorsOptions(["https://app.example.com"]);
    expect(opts!.credentials).toBe(true);
  });
});
