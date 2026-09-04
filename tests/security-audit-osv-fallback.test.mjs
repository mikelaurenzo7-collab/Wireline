import { describe, expect, it, vi } from "vitest";

import {
  buildOsvQueryEntries,
  chunkOsvQueryEntries,
  normalizeOsvAdvisories,
  requestOsvAdvisories,
} from "../scripts/lib/osv-audit.mjs";

describe("OSV dependency audit fallback", () => {
  it("builds and chunks exact npm package-version queries", () => {
    const entries = buildOsvQueryEntries({
      alpha: ["1.0.0", "1.1.0"],
      "@scope/beta": ["2.0.0"],
    });

    expect(entries).toEqual([
      {
        packageName: "alpha",
        version: "1.0.0",
        query: { package: { ecosystem: "npm", name: "alpha" }, version: "1.0.0" },
      },
      {
        packageName: "alpha",
        version: "1.1.0",
        query: { package: { ecosystem: "npm", name: "alpha" }, version: "1.1.0" },
      },
      {
        packageName: "@scope/beta",
        version: "2.0.0",
        query: {
          package: { ecosystem: "npm", name: "@scope/beta" },
          version: "2.0.0",
        },
      },
    ]);
    expect(chunkOsvQueryEntries(entries, 2)).toEqual([entries.slice(0, 2), entries.slice(2)]);
  });

  it("returns a clean report when every queried version has no vulnerabilities", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      return new globalThis.Response(
        JSON.stringify({ results: request.queries.map(() => ({})) }),
        { status: 200 },
      );
    });

    await expect(
      requestOsvAdvisories(
        { alpha: ["1.0.0"], beta: ["2.0.0"] },
        { fetchImpl, timeoutMs: 1_000 },
      ),
    ).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows per-query pagination, retrieves details, and deduplicates aliases", async () => {
    const progress = [];
    const fetchImpl = vi.fn(async (url, init = {}) => {
      if (url.endsWith("/v1/querybatch")) {
        const request = JSON.parse(init.body);
        const paginated = request.queries.some((query) => query.page_token === "next-alpha");
        if (paginated) {
          expect(request.queries).toEqual([
            {
              package: { ecosystem: "npm", name: "alpha" },
              version: "1.0.0",
              page_token: "next-alpha",
            },
          ]);
          return new globalThis.Response(
            JSON.stringify({
              results: [{ vulns: [{ id: "CVE-2026-0001", modified: "2026-09-03T00:00:00Z" }] }],
            }),
            { status: 200 },
          );
        }

        return new globalThis.Response(
          JSON.stringify({
            results: [
              {
                vulns: [
                  { id: "GHSA-aaaa-bbbb-cccc", modified: "2026-09-03T00:00:00Z" },
                ],
                next_page_token: "next-alpha",
              },
              {},
            ],
          }),
          { status: 200 },
        );
      }

      const id = decodeURIComponent(new URL(url).pathname.split("/").at(-1));
      return new globalThis.Response(
        JSON.stringify({
          id,
          aliases:
            id === "GHSA-aaaa-bbbb-cccc"
              ? ["CVE-2026-0001"]
              : ["GHSA-aaaa-bbbb-cccc"],
          summary: "Example production vulnerability",
          database_specific: { severity: "HIGH" },
          affected: [
            {
              package: { ecosystem: "npm", name: "alpha" },
              ecosystem_specific: { severity: "HIGH" },
            },
          ],
        }),
        { status: 200 },
      );
    });

    await expect(
      requestOsvAdvisories(
        { alpha: ["1.0.0"], beta: ["2.0.0"] },
        {
          fetchImpl,
          timeoutMs: 1_000,
          onBatch: (event) => progress.push(event),
        },
      ),
    ).resolves.toEqual([
      {
        packageName: "alpha",
        id: "GHSA-AAAA-BBBB-CCCC",
        title: "Example production vulnerability",
        severity: "high",
        vulnerableVersions: "1.0.0",
      },
    ]);
    expect(progress).toEqual([{ batchNumber: 1, batchCount: 1, queryCount: 2 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("uses package-specific severity and the highest recognized duplicate severity", () => {
    const contexts = new Map([
      [
        "GHSA-aaaa-bbbb-cccc",
        [
          { packageName: "alpha", version: "1.0.0" },
          { packageName: "alpha", version: "1.1.0" },
        ],
      ],
    ]);

    expect(
      normalizeOsvAdvisories(
        [
          {
            id: "GHSA-aaaa-bbbb-cccc",
            summary: "Package-specific example",
            database_specific: { severity: "MODERATE" },
            affected: [
              {
                package: { ecosystem: "npm", name: "alpha" },
                ecosystem_specific: { severity: "CRITICAL" },
              },
            ],
          },
        ],
        contexts,
      ),
    ).toEqual([
      {
        packageName: "alpha",
        id: "GHSA-AAAA-BBBB-CCCC",
        title: "Package-specific example",
        severity: "critical",
        vulnerableVersions: "1.0.0, 1.1.0",
      },
    ]);
  });

  it("fails closed when OSV cannot establish a recognized severity", () => {
    expect(() =>
      normalizeOsvAdvisories(
        [{ id: "GHSA-aaaa-bbbb-cccc", summary: "Unknown severity" }],
        new Map([
          ["GHSA-aaaa-bbbb-cccc", [{ packageName: "alpha", version: "1.0.0" }]],
        ]),
      ),
    ).toThrow("did not provide a recognized severity");
  });

  it("retries transient failures, stops on terminal 4xx, and reports timeouts", async () => {
    const transientFetch = vi
      .fn()
      .mockResolvedValueOnce(new globalThis.Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(
        new globalThis.Response(JSON.stringify({ results: [{}] }), { status: 200 }),
      );

    await expect(
      requestOsvAdvisories(
        { alpha: ["1.0.0"] },
        {
          fetchImpl: transientFetch,
          retryDelayMs: 0,
          sleep: async () => {},
          timeoutMs: 1_000,
        },
      ),
    ).resolves.toEqual([]);
    expect(transientFetch).toHaveBeenCalledTimes(2);

    const terminalFetch = vi.fn().mockResolvedValue(
      new globalThis.Response("bad query", { status: 400 }),
    );
    await expect(
      requestOsvAdvisories(
        { alpha: ["1.0.0"] },
        { fetchImpl: terminalFetch, sleep: async () => {}, timeoutMs: 1_000 },
      ),
    ).rejects.toThrow("HTTP 400");
    expect(terminalFetch).toHaveBeenCalledTimes(1);

    const abortingFetch = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new globalThis.DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    await expect(
      requestOsvAdvisories(
        { alpha: ["1.0.0"] },
        {
          attempts: 2,
          fetchImpl: abortingFetch,
          retryDelayMs: 0,
          sleep: async () => {},
          timeoutMs: 5,
        },
      ),
    ).rejects.toThrow("timed out after 5ms (attempt 2/2)");
  });

  it("rejects malformed coverage and unsafe endpoints", async () => {
    expect(() => buildOsvQueryEntries({ alpha: [] })).toThrow("invalid versions");
    expect(() => chunkOsvQueryEntries([], 2)).toThrow("non-empty array");

    const malformedFetch = vi.fn().mockResolvedValue(
      new globalThis.Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    await expect(
      requestOsvAdvisories(
        { alpha: ["1.0.0"] },
        { fetchImpl: malformedFetch, attempts: 1, timeoutMs: 1_000 },
      ),
    ).rejects.toThrow("0 results for 1 queries");

    await expect(
      requestOsvAdvisories(
        { alpha: ["1.0.0"] },
        { queryEndpoint: "http://osv.example.com/v1/querybatch" },
      ),
    ).rejects.toThrow("must use HTTPS");
  });
});

// Exact-head certification marker: run this fallback through the canonical release lane.
