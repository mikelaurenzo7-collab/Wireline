import express from "express";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  signTextingPolicyToken,
  textingPolicyUrls,
  verifyTextingPolicyToken,
} from "../src/lib/texting-policy-link";
import { formatErrorResponse } from "../src/lib/api-error";
import textingPolicyRouter from "../src/routes/texting-policy-routes";

const KEY = Buffer.alloc(32, 7).toString("base64");

beforeEach(() => {
  vi.stubEnv("WIRELINE_DATA_KEY", KEY);
});

describe("signed texting policy links", () => {
  it("round-trips a brand name and points carriers at the production origin", () => {
    const token = signTextingPolicyToken("  Dana   Fixes It ");
    expect(verifyTextingPolicyToken(token)).toBe("Dana Fixes It");
    const urls = textingPolicyUrls("Dana Fixes It");
    expect(urls.privacyUrl).toMatch(
      /^https:\/\/botbound\.app\/texting\/[\w-]+\.[\w-]{43}\/privacy$/,
    );
    expect(urls.termsUrl).toBe(urls.privacyUrl.replace(/privacy$/, "terms"));
  });

  it("verifies the longest names, including accents and non-Latin scripts", () => {
    for (const brand of ["x".repeat(60), "é".repeat(60), "日".repeat(60), "Peña Plumbing & Sons"]) {
      expect(verifyTextingPolicyToken(signTextingPolicyToken(brand))).toBe(brand);
    }
  });

  it("refuses forged, altered and malformed tokens", () => {
    const token = signTextingPolicyToken("Dana Fixes It");
    const [payload, sig] = token.split(".");
    const forged = `${Buffer.from("Someone Else").toString("base64url")}.${sig}`;
    expect(verifyTextingPolicyToken(forged)).toBeNull();
    expect(verifyTextingPolicyToken(`${payload}.${sig.slice(0, -1)}A`)).toBeNull();
    for (const bad of ["", "nodot", `${payload}.`, `.${sig}`, `${payload}.${sig}.x`, 42, null]) {
      expect(verifyTextingPolicyToken(bad)).toBeNull();
    }
  });

  it("depends on the data key: another key rejects the link, no key cannot sign", () => {
    const token = signTextingPolicyToken("Dana Fixes It");
    vi.stubEnv("WIRELINE_DATA_KEY", Buffer.alloc(32, 9).toString("base64"));
    expect(verifyTextingPolicyToken(token)).toBeNull();
    vi.stubEnv("WIRELINE_DATA_KEY", "");
    expect(verifyTextingPolicyToken(token)).toBeNull();
    expect(() => signTextingPolicyToken("Dana Fixes It")).toThrow(/WIRELINE_DATA_KEY/);
  });

  it("refuses empty, overlong and control-character brand names", () => {
    for (const bad of ["", "   ", "x".repeat(61), "Dana\u0007Fixes"]) {
      expect(() => signTextingPolicyToken(bad)).toThrow();
    }
  });
});

describe("GET /api/texting-policy/:token", () => {
  let server: Server;
  let base = "";

  beforeAll(async () => {
    const app = express();
    app.use(textingPolicyRouter);
    // The same formatting server.ts applies to thrown AppErrors.
    app.use(
      (
        error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        const { status, body } = formatErrorResponse(error);
        res.status(status).json(body);
      },
    );
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("returns only the signed brand name, cacheable and unindexed", async () => {
    const response = await fetch(
      `${base}/api/texting-policy/${signTextingPolicyToken("Dana Fixes It")}`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ brandName: "Dana Fixes It" });
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  it("answers 404 for a link BotBound did not sign", async () => {
    const forged = `${Buffer.from("Anyone").toString("base64url")}.${"A".repeat(43)}`;
    const response = await fetch(`${base}/api/texting-policy/${forged}`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("hosted texting policy pages", () => {
  const page = readFileSync("src/pages/TextingPolicyPage.tsx", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");

  it("are routed publicly and kept out of search", () => {
    expect(app).toContain('path="/texting/:token/privacy"');
    expect(app).toContain('path="/texting/:token/terms"');
    expect(readFileSync("src/lib/app-route-manifest.ts", "utf8")).toContain('"/texting"');
    expect(readFileSync("server.ts", "utf8")).toContain('normalizedPath.startsWith("/texting/")');
    expect(page).toContain("noIndex");
    expect(readFileSync("src/server/register-api-routes.ts", "utf8")).toContain(
      "app.use(textingPolicyRouter)",
    );
  });

  it("carry the statements carriers check before approving a campaign", () => {
    // Privacy: the non-sharing statement TCR looks for, word for word.
    expect(page).toContain(
      "No mobile information will be shared with third parties or affiliates for marketing or",
    );
    expect(page).toContain("Text messaging opt in data and consent are never shared with any");
    // Terms: program, frequency, rates, STOP, HELP, carrier liability, consent.
    for (const phrase of [
      "Customer Care Texts",
      "Message frequency varies",
      "Message and data rates may apply.",
      "STOP</strong> to stop",
      "HELP</strong> for help",
      "Carriers are not liable for delayed",
      "not a condition of any purchase",
    ]) {
      expect(page).toContain(phrase);
    }
  });
});
