/**
 * Guards error-vs-empty handling in insights views and related UI primitives.
 * Runs in the node vitest environment (source contracts, no DOM renderer).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("insights error handling contracts", () => {
  it("QualityView surfaces fetch errors with ErrCard before empty state", () => {
    const src = read("components/insights/QualityView.tsx");
    expect(src).toContain("const [err, setErr]");
    expect(src).toMatch(/if \(err\) return <ErrCard/);
    expect(src).toMatch(/setErr\(null\)/);
    expect(src).toMatch(/setData\(null\)/);
  });

  it("AISpendView never returns null when totals are missing", () => {
    const src = read("components/insights/AISpendView.tsx");
    expect(src).not.toMatch(/return null;/);
    expect(src).toContain('<InsightEmpty configKey="spend"');
    expect(src).toContain("<SpendBudgetCard />");
  });

  it("TopicsView and FailureModesView show InsightEmpty for empty arrays", () => {
    const topics = read("components/insights/TopicsView.tsx");
    const failures = read("components/insights/FailureModesView.tsx");
    expect(topics).toMatch(/topics\.length === 0/);
    expect(topics).toContain('<InsightEmpty configKey="topics"');
    expect(failures).toMatch(/modes\.length === 0/);
    expect(failures).toContain('<InsightEmpty configKey="failureModesOk"');
  });

  it("VoiceLatencyView labels pipeline errors once (not duplicate STT/TTS)", () => {
    const src = read("components/insights/VoiceLatencyView.tsx");
    expect(src).toContain("Pipeline errors");
    expect(src).not.toContain("STT health");
    expect(src).not.toContain("TTS health");
    expect(src).not.toContain("function cn(");
    expect(src).toContain('from "../../lib/utils"');
  });
});

describe("Status page loading contract", () => {
  it("does not default to operational before the first health probe", () => {
    const src = read("components/Status.tsx");
    expect(src).toMatch(/loading && !data \? "unknown"/);
  });
});

describe("EmptyState routing contract", () => {
  it("uses React Router Link for internal paths", () => {
    const src = read("components/ui/EmptyState.tsx");
    expect(src).toContain('from "react-router-dom"');
    expect(src).toMatch(/<Link to=\{action\.to\}/);
    expect(src).toMatch(/action\.to\.startsWith\("\/"\)/);
  });
});

describe("DncManager API contract", () => {
  it("uses readApiJson and import limits", () => {
    const src = read("components/DncManager.tsx");
    expect(src).toContain("readApiJson");
    expect(src).toContain("dnc-import-limits");
    expect(src).toContain("DNC_IMPORT_MAX_ENTRIES");
  });
});
