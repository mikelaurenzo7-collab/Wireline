import { describe, it, expect, afterEach } from "vitest";
import { getWirelineIntakeOpenApi } from "./openapi-intake-spec";

describe("getWirelineIntakeOpenApi", () => {
  const origAppUrl = process.env.APP_URL;

  afterEach(() => {
    if (origAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = origAppUrl;
  });

  it("returns OpenAPI 3.0.3 with intake paths and security scheme", () => {
    process.env.APP_URL = "https://app.example.com/";
    const spec = getWirelineIntakeOpenApi() as Record<string, unknown>;
    expect(spec.openapi).toBe("3.0.3");
    const paths = spec.paths as Record<string, unknown>;
    expect(paths["/api/intake/lead"]).toBeDefined();
    expect(paths["/api/intake/leads"]).toBeDefined();
    const comps = spec.components as Record<string, unknown>;
    const schemes = comps.securitySchemes as Record<string, unknown>;
    expect(schemes.WirelineIntakeKey).toMatchObject({
      type: "apiKey",
      in: "header",
      name: "X-Wireline-Key",
    });
  });

  it("uses APP_URL for servers[0].url when set", () => {
    process.env.APP_URL = "https://wireline.test/";
    const spec = getWirelineIntakeOpenApi() as { servers: Array<{ url: string }> };
    expect(spec.servers[0].url).toBe("https://wireline.test");
  });

  it("falls back to placeholder when APP_URL unset", () => {
    delete process.env.APP_URL;
    const spec = getWirelineIntakeOpenApi() as { servers: Array<{ url: string }> };
    expect(spec.servers[0].url).toBe("https://YOUR_APP_URL");
  });
});
