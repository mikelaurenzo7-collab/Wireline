from __future__ import annotations

import copy
import hashlib
import json
import re
from pathlib import Path

ROOT = Path.cwd()
MIGRATION_TAG = "0154_xai_grok_46_persisted_defaults"
MIGRATION_PATH = f"drizzle/migrations/{MIGRATION_TAG}.sql"
SNAPSHOT_ID = "96da4f2e-8d80-46e0-834f-ac2d20306fb5"
SNAPSHOT_PATH = ROOT / "drizzle/migrations/meta/0052_snapshot.json"
SETTINGS_TABLE = "public.wireline_settings"


def read(path: str | Path) -> str:
    return (ROOT / path).read_text(encoding="utf-8") if isinstance(path, str) else path.read_text(encoding="utf-8")


def write(path: str | Path, value: str) -> None:
    target = ROOT / path if isinstance(path, str) else path
    target.write_text(value, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if text.count(old) != 1:
        raise RuntimeError(f"{path}: expected one match for {old[:120]!r}, found {text.count(old)}")
    write(path, text.replace(old, new, 1))


def replace_regex_once(path: str, pattern: str, replacement: str) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}: {pattern[:120]!r}")
    write(path, updated)


# Canonical Drizzle schema mirrors must describe the same persisted default as
# the new migration. Preserve 0151 itself: its applied hash is immutable history.
for schema_path in ("src/db/schema.ts", "src/db/schema-base.ts"):
    text = read(schema_path)
    text, model_count = re.subn(
        r'(voiceLlmModel:\s*text\("voice_llm_model"\)\.default\(")grok-4\.3("\))',
        r'\1grok-4.6\2',
        text,
        count=1,
    )
    if model_count != 1:
        raise RuntimeError(f"{schema_path}: managed voice_llm_model default was not found exactly once")
    text = re.sub(
        r'`drizzle/migrations/015[0-9]_[^`]+\.sql`',
        f'`{MIGRATION_PATH}`',
        text,
        count=1,
    )
    write(schema_path, text)

# Journal 0154 after the retained-registration migration. Never renumber or
# rewrite existing entries because Drizzle's applied SQL hashes are historical.
journal_path = ROOT / "drizzle/migrations/meta/_journal.json"
journal = json.loads(journal_path.read_text(encoding="utf-8"))
entries = journal.get("entries")
if not isinstance(entries, list) or not entries:
    raise RuntimeError("Drizzle journal entries are missing")
if entries[-1].get("tag") == MIGRATION_TAG:
    if entries[-1].get("idx") != 52:
        raise RuntimeError("0154 journal entry has an unexpected index")
else:
    if entries[-1].get("idx") != 51 or entries[-1].get("tag") != "0153_preserve_xai_registration_ledger":
        raise RuntimeError("Drizzle journal no longer ends at the reviewed 0153 migration")
    entries.append(
        {
            "idx": 52,
            "version": "7",
            "when": 1787025047294,
            "tag": MIGRATION_TAG,
            "breakpoints": True,
        }
    )
journal_path.write_text(f"{json.dumps(journal, indent=2)}\n", encoding="utf-8")

# 0154 changes only the settings default. Clone the reviewed 0051 snapshot,
# advance identity, and change that single column default.
previous_path = ROOT / "drizzle/migrations/meta/0051_snapshot.json"
previous = json.loads(previous_path.read_text(encoding="utf-8"))
if previous.get("version") != "7":
    raise RuntimeError("0051 snapshot version changed")
settings = previous.get("tables", {}).get(SETTINGS_TABLE)
if not isinstance(settings, dict):
    raise RuntimeError("0051 snapshot is missing wireline_settings")
model_column = settings.get("columns", {}).get("voice_llm_model")
if not isinstance(model_column, dict):
    raise RuntimeError("0051 snapshot is missing voice_llm_model")

snapshot = copy.deepcopy(previous)
snapshot["id"] = SNAPSHOT_ID
snapshot["prevId"] = previous.get("id")
snapshot["tables"][SETTINGS_TABLE]["columns"]["voice_llm_model"]["default"] = "'grok-4.6'"
serialized_snapshot = f"{json.dumps(snapshot, indent=2)}\n"
SNAPSHOT_PATH.write_text(serialized_snapshot, encoding="utf-8")
snapshot_hash = hashlib.sha256(serialized_snapshot.encode("utf-8")).hexdigest()

# Keep the permanent materializer capable of reproducing and verifying 0052.
materializer_path = "scripts/materialize-drizzle-meta.mjs"
materializer = read(materializer_path)
if "TARGET_0052_PATH" not in materializer:
    materializer = materializer.replace(
        'const TARGET_0051_PATH = resolve(ROOT, "drizzle/migrations/meta/0051_snapshot.json");\n',
        'const TARGET_0051_PATH = resolve(ROOT, "drizzle/migrations/meta/0051_snapshot.json");\n'
        'const TARGET_0052_PATH = resolve(ROOT, "drizzle/migrations/meta/0052_snapshot.json");\n',
        1,
    )
    materializer = materializer.replace(
        'const TARGET_0051_SHA256 = "ca35f3a7f91759ff9600900fef8d8633b58c34bebcaf17707d080d756d121068";\n',
        'const TARGET_0051_SHA256 = "ca35f3a7f91759ff9600900fef8d8633b58c34bebcaf17707d080d756d121068";\n'
        f'const TARGET_0052_ID = "{SNAPSHOT_ID}";\n'
        f'const TARGET_0052_SHA256 = "{snapshot_hash}";\n',
        1,
    )
    function_marker = "\nfunction writeSnapshot(path, serialized, expectedHash) {"
    grok_function = '''

export function buildGrok46DefaultsSnapshot(preservedSnapshot) {
  if (
    !preservedSnapshot ||
    preservedSnapshot.id !== TARGET_0051_ID ||
    preservedSnapshot.version !== "7"
  ) {
    throw new Error("0051 snapshot identity changed; refusing to synthesize 0052.");
  }
  const snapshot = structuredClone(preservedSnapshot);
  snapshot.id = TARGET_0052_ID;
  snapshot.prevId = preservedSnapshot.id;
  snapshot.tables["public.wireline_settings"].columns.voice_llm_model.default = "'grok-4.6'";
  return snapshot;
}
'''
    if function_marker not in materializer:
        raise RuntimeError("materializer writeSnapshot marker is missing")
    materializer = materializer.replace(function_marker, grok_function + function_marker, 1)

    old_materialize = '''  const preservedSerialized = `${JSON.stringify(buildPreservedRegistrationSnapshot(nativeSnapshot), null, 2)}\\n`;
  const native = writeSnapshot(TARGET, nativeSerialized, TARGET_SHA256);
  const preserved = writeSnapshot(TARGET_0051_PATH, preservedSerialized, TARGET_0051_SHA256);
  return { native, preserved };
}'''
    new_materialize = '''  const preservedSnapshot = buildPreservedRegistrationSnapshot(nativeSnapshot);
  const preservedSerialized = `${JSON.stringify(preservedSnapshot, null, 2)}\\n`;
  const grok46Serialized = `${JSON.stringify(buildGrok46DefaultsSnapshot(preservedSnapshot), null, 2)}\\n`;
  const native = writeSnapshot(TARGET, nativeSerialized, TARGET_SHA256);
  const preserved = writeSnapshot(TARGET_0051_PATH, preservedSerialized, TARGET_0051_SHA256);
  const grok46 = writeSnapshot(TARGET_0052_PATH, grok46Serialized, TARGET_0052_SHA256);
  return { native, preserved, grok46 };
}'''
    if old_materialize not in materializer:
        raise RuntimeError("materializer body marker is missing")
    materializer = materializer.replace(old_materialize, new_materialize, 1)
    materializer += '''
if (result.grok46.changed) {
  console.log(`Materialized Drizzle snapshot 0052 (${result.grok46.sha256.slice(0, 12)}…).`);
}
'''
else:
    if f'const TARGET_0052_SHA256 = "{snapshot_hash}";' not in materializer:
        raise RuntimeError("materializer 0052 hash does not match generated snapshot")
write(materializer_path, materializer)

# Update contracts that intentionally pin the journal head and add a focused
# immutable-history/default reconciliation contract.
silent_path = "tests/silent-failure-round2-contract.test.ts"
silent = read(silent_path)
old_latest = '''    expect(journal.entries.at(-1)).toMatchObject({
      idx: 51,
      tag: "0153_preserve_xai_registration_ledger",
    });'''
if old_latest in silent:
    silent = silent.replace(
        old_latest,
        '''    expect(journal.entries).toContainEqual(
      expect.objectContaining({
        idx: 51,
        tag: "0153_preserve_xai_registration_ledger",
      }),
    );
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 52,
      tag: "0154_xai_grok_46_persisted_defaults",
    });''',
        1,
    )
write(silent_path, silent)

write(
    "tests/grok-46-persisted-defaults-contract.test.ts",
    '''import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("persisted Grok 4.6 managed defaults", () => {
  it("keeps applied 0151 immutable and reconciles through 0154", () => {
    const legacy = read("drizzle/migrations/0151_xai_grok_46_runtime_defaults.sql");
    const correction = read("drizzle/migrations/0154_xai_grok_46_persisted_defaults.sql");
    expect(legacy).toContain("grok-4.3");
    expect(correction).toContain("Do not rewrite 0151");
    expect(correction).toContain("ALTER COLUMN voice_llm_model SET DEFAULT 'grok-4.6'");
    expect(correction).toContain("voice_llm_provider = 'xai'");
    expect(correction).toContain("voice_llm_model = 'grok-4.3'");
    expect(correction).not.toMatch(/provider\s*<>|model\s*<>/);
  });

  it("aligns both schema mirrors and journals a reproducible snapshot", () => {
    const schema = read("src/db/schema.ts");
    const base = read("src/db/schema-base.ts");
    const journal = read("drizzle/migrations/meta/_journal.json");
    const materializer = read("scripts/materialize-drizzle-meta.mjs");
    const snapshot = read("drizzle/migrations/meta/0052_snapshot.json");

    for (const source of [schema, base]) {
      expect(source).toContain('voiceLlmModel: text("voice_llm_model").default("grok-4.6")');
      expect(source).not.toContain('voiceLlmModel: text("voice_llm_model").default("grok-4.3")');
    }
    expect(schema).toContain("0154_xai_grok_46_persisted_defaults.sql");
    expect(base).toContain("0154_xai_grok_46_persisted_defaults.sql");
    expect(journal).toContain('"idx": 52');
    expect(journal).toContain('"tag": "0154_xai_grok_46_persisted_defaults"');
    expect(materializer).toContain("TARGET_0052_PATH");
    expect(materializer).toContain("buildGrok46DefaultsSnapshot");
    expect(materializer).not.toContain('TARGET_0052_SHA256 = "PENDING_COMPUTE"');
    expect(snapshot).toContain('"default": "\\'grok-4.6\\'"');
  });
});
''',
)

print(f"Applied 0154 Grok 4.6 schema metadata ({snapshot_hash[:12]}…).")
