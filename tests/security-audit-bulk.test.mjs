import { Buffer } from "node:buffer";
import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  buildProductionPackagePayload,
  classifyHighSeverityAdvisories,
  decodeBulkAdvisoryBody,
  flattenBulkAdvisories,
  requestBulkAdvisories,
  resolveBulkAuditEndpoint,
} from "../scripts/lib/npm-bulk-audit.mjs";

describe("npm Bulk Advisory security gate", () => {
  it("builds a deterministic production-only payload from lockfile v3", () => {
    const payload = buildProductionPackagePayload({
      lockfileVersion: 3,
      packages: {
        "": { version: "1.0.0" },
        "node_modules/runtime": { version: "2.0.0" },
        "node_modules/nested/node_modules/runtime": { version: "1.10.0" },
        "node_modules/@scope/runtime": { version: "3.0.0" },
        "node_modules/runtime-alias": { name: "actual-runtime", version: "4.0.0" },
        "node_modules/optional-runtime": { version: "5.0.0", optional: true },
        "node_modules/dev-optional-runtime": { version: "6.0.0", devOptional: true },
        "node_modules/dev-only": { version: "7.0.0", dev: true },
        "node_modules/local-link": { version: "8.0.0", link: true },
      },
    });

    expect(payload).toEqual({
      "@scope/runtime": ["3.0.0"],
      "actual-runtime": ["4.0.0"],
      "dev-optional-runtime": ["6.0.0"],
      "optional-runtime": ["5.0.0"],
      runtime: ["1.10.0", "2.0.0"],
    });
  });

  it("decodes both ordinary JSON and unlabeled gzip bodies", () => {
    const report = {
      runtime: [
        {
          id: 1,
          url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
          title: "Example advisory",
          severity: "high",
          vulnerable_versions: "<2.0.0",
        },
      ],
    };
    const json = Buffer.from(JSON.stringify(report));

    expect(decodeBulkAdvisoryBody(json)).toEqual(report);
    expect(decodeBulkAdvisoryBody(gzipSync(json))).toEqual(report);
  });

  it("matches npm-registry-fetch's gzipped Bulk Advisory request format", async () => {
    const payload = { runtime: ["1.0.0"] };
    let request;
    const fetchImpl = vi.fn(async (_url, init) => {
      request = init;
      return new globalThis.Response("{}", { status: 200 });
    });

    await expect(
      requestBulkAdvisories(payload, { fetchImpl, timeoutMs: 1_000 }),
    ).resolves.toEqual({});
    expect(request.headers["Content-Encoding"]).toBe("gzip");
    expect(JSON.parse(gunzipSync(request.body).toString("utf8"))).toEqual(payload);
  });

  it("retries transient endpoint failures but never retries a terminal 4xx response", async () => {
    const reportBody = gzipSync(Buffer.from("{}"));
    const transientFetch = vi
      .fn()
      .mockResolvedValueOnce(new globalThis.Response("temporarily unavailable", { status: 503 }))
      .mockResolvedValueOnce(new globalThis.Response(reportBody, { status: 200 }));

    await expect(
      requestBulkAdvisories(
        { runtime: ["1.0.0"] },
        { fetchImpl: transientFetch, sleep: async () => {}, timeoutMs: 1_000 },
      ),
    ).resolves.toEqual({});
    expect(transientFetch).toHaveBeenCalledTimes(2);

    const terminalFetch = vi.fn().mockResolvedValue(new globalThis.Response("bad payload", { status: 400 }));
    await expect(
      requestBulkAdvisories(
        { runtime: ["1.0.0"] },
        { fetchImpl: terminalFetch, sleep: async () => {}, timeoutMs: 1_000 },
      ),
    ).rejects.toThrow("HTTP 400");
    expect(terminalFetch).toHaveBeenCalledTimes(1);
  });

  it("classifies only validated high and critical advisories as release blockers", () => {
    const advisories = flattenBulkAdvisories({
      runtime: [
        {
          id: 1,
          url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
          title: "Accepted high",
          severity: "high",
          vulnerable_versions: "<2.0.0",
        },
        {
          id: 2,
          url: "https://github.com/advisories/GHSA-dddd-eeee-ffff",
          title: "Blocking critical",
          severity: "critical",
          vulnerable_versions: "*",
        },
        {
          id: 3,
          url: "https://github.com/advisories/GHSA-1111-2222-3333",
          title: "Nonblocking moderate",
          severity: "moderate",
          vulnerable_versions: "*",
        },
      ],
    });

    expect(
      classifyHighSeverityAdvisories(advisories, new Set(["GHSA-AAAA-BBBB-CCCC"])),
    ).toEqual({
      accepted: [expect.objectContaining({ id: "GHSA-AAAA-BBBB-CCCC" })],
      blocking: [expect.objectContaining({ id: "GHSA-DDDD-EEEE-FFFF" })],
    });
  });

  it("fails closed on malformed reports and unsafe registry URLs", () => {
    expect(() => flattenBulkAdvisories({ runtime: { severity: "high" } })).toThrow(
      "was not an array",
    );
    expect(() => decodeBulkAdvisoryBody(Buffer.from("not-json"))).toThrow("invalid JSON");
    expect(() => resolveBulkAuditEndpoint("http://registry.example.com")).toThrow("must use HTTPS");
    expect(resolveBulkAuditEndpoint("http://localhost:4873/registry")).toBe(
      "http://localhost:4873/registry/-/npm/v1/security/advisories/bulk",
    );
  });
});
