/**
 * Contract boundaries for the gated in-house voice-cloning customer preview lane.
 *
 * These invariants must survive the 0184 journal rebase and any future lane
 * work: default-off canary gating, preview-only usage, bounded retention,
 * append-only evidence, and terminal account erasure.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ACCOUNT_DELETION_TARGETS, ACCOUNT_DELETION_TABLES } from "../src/lib/account-deletion";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const service = read("src/lib/voice/voice-asset-service.ts");
const routes = read("src/routes/voice-asset-routes.ts");
const jobRoutes = read("src/routes/job-routes.ts");
const migration = read("drizzle/migrations/0185_voice_clone_customer_lane.sql");
const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json")) as {
  entries: Array<{ idx: number; tag: string }>;
};

function sourceFiles(dir: string): string[] {
  return readdirSync(resolve(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("customer voice clone lane contract", () => {
  it("keeps the platform-admin pilot unchanged and defaults the customer lane off", () => {
    expect(service).toContain('process.env.VOICE_CLONE_PILOT_ENABLED === "true"');
    expect(service).toContain('process.env.VOICE_CLONE_CUSTOMER_ENABLED === "true"');
    expect(service).toContain("process.env.VOICE_CLONE_CUSTOMER_ALLOWLIST");
    expect(service).toContain("process.env.VOICE_CLONE_RETENTION_DAYS");
    // Both gates must pass for the customer lane; the admin check short-circuits
    // first and only runs while the unchanged pilot flag is on.
    expect(service).toContain("deps.customerEnabled() && deps.customerAllowed(actor)");
    expect(service).toContain("deps.enabled() && (await deps.isAdmin(actor))");
    // Fail closed rather than silently granting an unconfigured lane.
    expect(service).toContain("VOICE_CLONE_PILOT_UNAVAILABLE");
    expect(service).toContain("VOICE_CLONE_RETENTION_UNAVAILABLE");
  });

  it("normalizes the canary allowlist to lowercase emails and user UUIDs", () => {
    expect(service).toContain("export function parseVoiceCloneAllowlist");
    expect(service).toContain(".map((value) => value.trim().toLowerCase())");
    expect(service).toContain("actor.email?.trim().toLowerCase()");
    expect(service).toContain("actor.id.trim().toLowerCase()");
    expect(service).toContain("allowlist.has(userId)");
  });

  it("bounds retention with the documented 30-day default and 1..365 range", () => {
    expect(service).toContain("VOICE_CLONE_RETENTION_DAYS_DEFAULT");
    expect(service).toContain("VOICE_CLONE_RETENTION_DAYS_MIN");
    expect(service).toContain("VOICE_CLONE_RETENTION_DAYS_MAX");
    expect(service).toContain("/^\\d+$/");
    const schema = read("src/db/voice-asset-schema.ts");
    expect(schema).toContain("VOICE_CLONE_RETENTION_DAYS_DEFAULT = 30");
    expect(schema).toContain("VOICE_CLONE_RETENTION_DAYS_MIN = 1");
    expect(schema).toContain("VOICE_CLONE_RETENTION_DAYS_MAX = 365");
    expect(schema).toContain('VOICE_CLONE_RETENTION_POLICY_VERSION = "voice-clone-retention-v1-');
    expect(migration).toContain("voice-clone-retention-v1-2026-10-24");
    expect(migration).toContain("expires_at");
  });

  it("records customer assets as bounded private previews only", () => {
    expect(service).toContain("customerVisible: true");
    expect(service).toContain("retentionPolicyVersion: VOICE_CLONE_RETENTION_POLICY_VERSION");
    expect(service).toContain("expiresAt,");
    expect(service).toContain('lane === "customer" ? customerExpiresAt(now) : null');
    // The intent stays private_preview for both lanes; no selection surface exists.
    expect(migration).not.toMatch(/intended_use\s*=/);
    expect(service).not.toMatch(/intendedUse:\s*["'](?!private_preview)/);
    expect(service).toContain('row.intendedUse !== "private_preview"');
    expect(service).toContain("VOICE_REFERENCE_EXPIRED");
  });

  it("exposes customer capabilities without admin/engine internals", () => {
    expect(service).toContain('lane: "customer_preview" as const');
    expect(service).toContain("retentionDays: days");
    // The customer capability branch never computes or returns engine readiness.
    const customerCapabilities = service.slice(
      service.indexOf('lane: "customer_preview" as const'),
    );
    expect(customerCapabilities).not.toContain("engineReady");
    expect(customerCapabilities).not.toContain("serviceToken");
    expect(customerCapabilities).not.toContain("VOICE_CLONE_PILOT_ENABLED");
  });

  it("appends an immutable event for every lifecycle change and committed preview", () => {
    expect(service).toContain("ledgerKind(action)");
    expect(service).toContain('"created"');
    expect(service).toContain('"preview"');
    expect(service).toContain("reservedUsdMicros: usdMicros(costUsd)");
    expect(service).toContain("committedUsdMicros: usdMicros(costUsd)");
    expect(service).toContain("deps.repository.recordPreview(");
    expect(service).toContain('deletedReason: "user_deleted"');
    expect(service).toContain('deletedReason: "retention_expired"');
    expect(migration).toContain("wireline_voice_clone_events");
    expect(migration).toContain("wireline_guard_voice_clone_event_ledger");
    expect(migration).toContain("Voice clone preview ledger rows are immutable");
  });

  it("expires due customer assets from the existing jobs sweep behind the customer flag", () => {
    expect(service).toContain("async expireDue(now: Date = deps.now())");
    expect(service).toContain("deps.repository.dueForExpiry(now, VOICE_CLONE_EXPIRY_BATCH)");
    expect(service).toContain('"voice_asset_expire"');
    expect(service).toContain('"expired"');
    expect(jobRoutes).toContain('process.env.VOICE_CLONE_CUSTOMER_ENABLED === "true"');
    expect(jobRoutes).toContain("voiceAssetService.expireDue()");
    expect(jobRoutes).toContain("voice_clone_assets_expired");
  });

  it("serves both lanes through one authenticated, rate-limited route surface", () => {
    expect(routes).toContain("requirePilotOrCustomerAccess");
    // While the canary is off, the pilot's audited platform-admin gate still
    // runs unchanged; with the canary on the service owns the lane decision.
    expect(routes).toContain("requirePlatformAdmin");
    expect(routes).toContain('process.env.VOICE_CLONE_CUSTOMER_ENABLED === "true"');
    expect(routes).toContain("void requirePlatformAdmin(req, res, next)");
    expect(routes).toContain("authenticateUser");
    expect(routes).toContain('bucket: "api:voice-assets-preview"');
    expect(routes).toContain('bucket: "api:voice-assets-write"');
    expect(routes).toContain('bucket: "api:voice-assets-read"');
    expect(routes).toContain('res.setHeader("Cache-Control", "no-store")');
    // No route, header or body exposes the encrypted envelope or raw audio.
    expect(routes).not.toContain("secretEncrypted");
    expect(routes).not.toContain("referenceAudioBase64");
  });

  it("registers the ledger and references for terminal account erasure", () => {
    expect(ACCOUNT_DELETION_TABLES).toContain("wireline_voice_clone_events");
    expect(ACCOUNT_DELETION_TABLES).toContain("wireline_voice_assets");
    expect(
      ACCOUNT_DELETION_TARGETS.find((target) => target.table === "wireline_voice_clone_events"),
    ).toMatchObject({ userColumns: ["user_id"] });
    const source = read("src/lib/account-deletion.ts");
    expect(source.indexOf('"wireline_voice_clone_events"')).toBeLessThan(
      source.indexOf('"wireline_voice_assets"'),
    );
    // The terminal purge escapes tenant context so the ledger guard permits it.
    expect(source).toContain("tenantStore.exit(() => purgeAccountOutsideTenantContext");
    expect(migration).toContain(
      "NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL",
    );
  });

  it("never wires an in-house asset into the live call runtime or voice selection", () => {
    // The preview lane is the only consumer of these tables outside schema and
    // account erasure. Any other reference would risk selecting a cloned voice
    // for a live call.
    const allowed = new Set([
      "src/db/voice-asset-schema.ts",
      "src/lib/voice/voice-asset-service.ts",
      "src/lib/account-deletion.ts",
    ]);
    const owners = sourceFiles("src").filter((file) =>
      /\bvoiceAssets\b|\bvoiceCloneEvents\b|wireline_voice_assets|wireline_voice_clone_events/.test(
        read(file),
      ),
    );
    expect(owners.sort()).toEqual([...allowed].sort());
    for (const livePath of [
      "src/lib/agent-tool-native-voice.ts",
      "src/lib/managed-voice-runtime.ts",
      "src/routes/live-voice-routes.ts",
      "src/lib/voice-catalog.ts",
      "src/lib/voice/voice-reference-audio.ts",
    ]) {
      const source = read(livePath);
      expect(source).not.toContain("wireline_voice_assets");
      expect(source).not.toContain("wireline_voice_clone_events");
      expect(source).not.toContain("voiceCloneEvents");
    }
  });

  it("keeps the migration strictly append-only and journaled after 0184", () => {
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(migration).not.toMatch(/TRUNCATE/i);
    expect(migration).not.toMatch(/\bUPDATE\s+public\./i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).toContain("SET lock_timeout = '5s'");
    expect(migration).toContain("RESET lock_timeout");
    const entry = journal.entries.find(
      (candidate) => candidate.tag === "0185_voice_clone_customer_lane",
    );
    // Main now has 0184 (live-call recording) at idx 82; this lane is the next
    // journaled migration and is chained to the 0184-era 0082 snapshot.
    expect(entry).toMatchObject({ idx: 83, tag: "0185_voice_clone_customer_lane" });
    expect(
      journal.entries.find((candidate) => candidate.tag === "0184_agent_call_recording"),
    ).toMatchObject({ idx: 82 });
    expect(journal.entries.filter((candidate) => candidate.tag === entry!.tag)).toHaveLength(1);
  });
});
