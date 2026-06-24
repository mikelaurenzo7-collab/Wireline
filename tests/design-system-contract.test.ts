import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const designSystem = read("src/styles/design-system.css");
const foundation = read("src/styles/foundation.css");
const button = read("src/components/atoms/Button.tsx");
const badge = read("src/components/atoms/Badge.tsx");
const tooltip = read("src/components/atoms/HelpTooltip.tsx");
const dataTable = read("src/components/organisms/DataTable.tsx");
const migrationPlan = read("references/migration-plan-atomic-design.md");

describe("Wireline design system contract", () => {
  it("activates the semantic foundation before component styles", () => {
    expect(designSystem).toContain('@import "./foundation.css"');
    expect(foundation).toContain("--wl-success-surface");
    expect(foundation).toContain("--wl-warning-surface");
    expect(foundation).toContain("--wl-error-surface");
  });

  it("uses CVA for finite action and status variants", () => {
    expect(button).toContain('from "class-variance-authority"');
    expect(button).toContain("loading?: boolean");
    expect(badge).toContain('from "class-variance-authority"');
    expect(badge).not.toContain("green-500");
    expect(badge).not.toContain("yellow-500");
    expect(badge).not.toContain("red-500");
  });

  it("does not rely on hover-only help or faux grids", () => {
    expect(tooltip).toContain("TooltipTrigger");
    expect(tooltip).toContain("aria-label");
    expect(dataTable).toContain("<table");
    expect(dataTable).toContain("<caption");
    expect(dataTable).not.toContain('role="grid"');
  });

  it("records migration ownership and completion criteria", () => {
    expect(migrationPlan).toContain("## Definition of done");
    expect(migrationPlan).toContain("## Governance");
  });
});
