#!/usr/bin/env node
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const watchedCandidates = [
  "src/components/DailyBrief.tsx",
  "src/components/PerformanceBenchmarks.tsx",
  "src/components/ui/AuroraWave.tsx",
  "src/components/ui/ConstellationField.tsx",
  "src/components/ui/GlyphMorph.tsx",
  "src/components/ui/HaloButton.tsx",
  "src/components/ui/NebulaPulse.tsx",
  "src/components/ui/PrismBadge.tsx",
  "src/components/ui/PulseRing.tsx",
  "src/components/ui/SignalThread.tsx",
  "src/components/ui/StatusOrb.tsx",
  "src/components/ui/VoidButton.tsx",
];

const retiredCandidates = [
  "src/components/AgentWorkspace.tsx",
  "src/components/layout/MobileBottomNav.tsx",
];

const resurrected = retiredCandidates.filter((file) => existsSync(file));
if (resurrected.length > 0) {
  console.error("Retired dead-code candidates have returned:\n" + resurrected.join("\n"));
  process.exit(1);
}

const tempDir = mkdtempSync(join(tmpdir(), "wireline-knip-"));
const knip = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["knip", "--include", "files", "--reporter", "json"],
  { encoding: "utf8" },
);

try {
  // Knip returns exit code 1 when it finds issues; that is expected for the
  // broader repo. This baseline only guards the triaged zero-import files.
  const raw = knip.stdout.trim();
  if (!raw) {
    console.error(knip.stderr || "Knip produced no JSON output.");
    process.exit(knip.status || 1);
  }

  const report = JSON.parse(raw);
  const unusedFiles = new Set((report.issues ?? []).map((issue) => issue.file));
  const regressed = watchedCandidates.filter((file) => unusedFiles.has(file));

  if (regressed.length > 0) {
    console.error(
      "Triaged dead-code candidates are unused again. Remount them deliberately, " +
        "delete them, or update this baseline with a documented reason:\n" +
        regressed.join("\n"),
    );
    process.exit(1);
  }

  console.log(
    `Dead-code baseline passed: ${watchedCandidates.length} remounted/design-system candidates ` +
      `and ${retiredCandidates.length} retired candidates are accounted for.`,
  );
} finally {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only.
  }
}
