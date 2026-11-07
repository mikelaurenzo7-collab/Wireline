import { readFileSync } from "node:fs";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import { liveVoices } from "../src/db/live-voice-schema";
import { BIOMETRIC_RELEASE_VERSION } from "../src/lib/voice/clone-engine-selection";

const name = "wireline_live_voices_biometric_release_check";
const table = "public.wireline_live_voices";
const prior = JSON.parse(readFileSync("drizzle/migrations/meta/0093_snapshot.json", "utf8"));
const next = JSON.parse(readFileSync("drizzle/migrations/meta/0094_snapshot.json", "utf8"));
const migration = readFileSync("drizzle/migrations/0196_live_voice_release_v3.sql", "utf8");

it("keeps signed legacy releases and the new provider-disclosed release valid across source, migration and snapshot", () => {
  const check = getTableConfig(liveVoices).checks.find((check) => check.name === name)!;
  const expression = new PgDialect().sqlToQuery(check.value).sql;
  expect(next.tables[table].checkConstraints[name].value).toBe(expression);
  expect(migration).toContain(expression);
  expect(expression).toContain("voice-release-v2-2026-10-24");
  expect(expression).toContain(BIOMETRIC_RELEASE_VERSION);
  expect(expression).toContain('"biometric_release_version" IS NOT NULL');
  expect(expression).toContain('"biometric_release_signed_name" IS NOT NULL');
  expect(expression).toContain('"biometric_release_accepted_at" IS NOT NULL');
});

it("changes only release validation and preserves the existing real-provider database boundary", () => {
  expect({ ...next.tables[table], checkConstraints: prior.tables[table].checkConstraints }).toEqual(
    prior.tables[table],
  );
  expect(Object.fromEntries(Object.entries(next.tables).filter(([key]) => key !== table))).toEqual(
    Object.fromEntries(Object.entries(prior.tables).filter(([key]) => key !== table)),
  );
  expect(migration).not.toMatch(/DELETE|TRUNCATE|DROP TABLE|provider_check/);
  expect(migration).toContain("DROP CONSTRAINT IF EXISTS");
  expect(
    next.tables[table].checkConstraints.wireline_live_voices_provider_check.value,
  ).not.toContain("inhouse");
});
