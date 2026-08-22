import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  currentProviderSafetyIdentifier,
  openAISafetyIdentifierForIdentity,
  runWithProviderIdentity,
} from "../src/lib/provider-identity-context";
import { tenantStore } from "../src/lib/tenant-context-store";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");
const expectedSafetyId = (identity: string) =>
  createHash("sha256").update(`botbound:${identity}`).digest("hex");

describe("provider identity context", () => {
  it("hashes the normalized internal identity without leaking it", async () => {
    const safetyId = await runWithProviderIdentity("  tenant-internal-123  ", async () => {
      await Promise.resolve();
      return currentProviderSafetyIdentifier();
    });

    expect(safetyId).toBe(expectedSafetyId("tenant-internal-123"));
    expect(safetyId).toHaveLength(64);
    expect(safetyId).not.toContain("tenant-internal-123");
    expect(currentProviderSafetyIdentifier()).toBeUndefined();
  });

  it("uses one stable identifier across Responses and Realtime", () => {
    expect(openAISafetyIdentifierForIdentity(" tenant-internal-123 ")).toBe(
      expectedSafetyId("tenant-internal-123"),
    );

    const realtime = read("src/lib/voice/openai-realtime-call-control.ts");
    expect(realtime).toContain("openAISafetyIdentifierForIdentity(");
    expect(realtime).not.toContain('createHash("sha256")');
  });

  it("does not change the database tenant context", async () => {
    await tenantStore.run("database-tenant", async () => {
      const providerId = await runWithProviderIdentity("provider-tenant", async () => {
        await Promise.resolve();
        expect(tenantStore.getStore()).toBe("database-tenant");
        return currentProviderSafetyIdentifier();
      });

      expect(providerId).toBe(expectedSafetyId("provider-tenant"));
      expect(tenantStore.getStore()).toBe("database-tenant");
    });
  });

  it("covers tenant jobs, cron briefs, and raw artifact requests", () => {
    const client = read("src/lib/ai-client.ts");
    const structured = read("src/lib/ai-structured.ts");
    const worker = read("src/lib/job-worker.ts");
    const dailyBrief = read("src/routes/daily-brief-routes.ts");
    const artifact = read("src/lib/openai-post-call-artifact.ts");

    expect(client).toContain("currentProviderSafetyIdentifier()");
    expect(client).not.toContain("tenantStore");
    expect(structured).toContain("withStructuredProviderIdentity");
    expect(worker).toContain("dispatchJobInProviderContext");
    expect(worker).toContain(
      "runWithProviderIdentity(userId, () => dispatchJobInProviderContext(job))",
    );
    expect(worker).not.toContain("tenantStore.run(userId");
    expect(dailyBrief).toContain("runWithProviderIdentity(uid, () =>");
    expect(artifact).toContain("store: false");
    expect(artifact).toContain("safety_identifier: safetyIdentifier");
  });
});
