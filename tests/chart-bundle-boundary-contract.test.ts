import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

/**
 * Recharts is by a wide margin the heaviest thing this app ships: roughly 107 kB
 * gzipped, more than the React, Motion, and Lucide vendor chunks put together.
 * Exactly three components draw with it, and all three sit behind a tab that is
 * not the default. Imported eagerly they put the entire charting library on the
 * critical path for everyone who opens Insights or Admin settings — including
 * the ten Insights tabs that never render a chart.
 *
 * The fix is a `lazy()` boundary at each consumer's import site. This contract
 * keeps it there: a future refactor that "tidies up" one of these back into a
 * static import silently triples the initial payload of two authenticated pages,
 * and nothing else in the suite would notice.
 */

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

/** Components that render Recharts directly. */
const CHART_COMPONENTS = [
  "src/components/insights/VoiceReliabilityView.tsx",
  "src/components/insights/QualityView.tsx",
  "src/components/admin/AuditActivityPanel.tsx",
];

/** The parents that mount them, each of which must do so lazily. */
const CHART_HOSTS = [
  "src/components/insights/InsightsView.tsx",
  "src/components/AdminSettings.tsx",
];

describe("chart bundle boundary contract", () => {
  it("keeps the set of Recharts consumers small and known", () => {
    const importers = globSync("src/**/*.tsx", { cwd: root })
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => /from ["']recharts["']/.test(source(file)))
      .sort();

    // A new chart component is fine — but it needs the same lazy treatment, so
    // it has to be added here deliberately rather than slipping in unnoticed.
    expect(
      importers,
      "a new Recharts consumer appeared; give it a lazy() boundary and add it here",
    ).toEqual([...CHART_COMPONENTS].sort());
  });

  it("mounts every chart component behind a lazy boundary, never a static import", () => {
    for (const host of CHART_HOSTS) {
      const text = source(host);

      for (const component of CHART_COMPONENTS) {
        const name = component
          .split("/")
          .pop()!
          .replace(/\.tsx$/, "");
        // Only assert against the components this host actually mounts.
        if (!text.includes(name)) continue;

        expect(
          text,
          `${host} must not statically import ${name} — that pulls Recharts onto the initial payload`,
        ).not.toMatch(new RegExp(`^import[^\\n]*\\b${name}\\b[^\\n]*from`, "m"));

        expect(text, `${host} must load ${name} through lazy()`).toMatch(
          new RegExp(`const ${name} = lazy\\(`),
        );
      }
    }
  });

  it("gives each lazy chart host a Suspense fallback so the tab never blanks", () => {
    for (const host of CHART_HOSTS) {
      const text = source(host);
      expect(text, `${host} loads a chart lazily and needs a Suspense boundary`).toContain(
        "<Suspense",
      );
      expect(text, `${host} must render a fallback rather than nothing`).toMatch(
        /<Suspense\s+fallback=/,
      );
    }
  });
});
