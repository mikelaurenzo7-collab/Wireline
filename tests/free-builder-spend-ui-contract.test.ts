import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Free Builder spend UI truth", () => {
  it("keeps the retired customer AI-spend view off the product", () => {
    expect(existsSync(resolve(root, "src/components/insights/AISpendView.tsx"))).toBe(false);
    const insights = read("src/pages/InsightsPage.tsx");
    expect(insights).not.toContain("AISpendView");
    expect(insights).not.toContain("Recorded AI Cost");
  });

  it("uses the server-owned guard scope rather than a customer dollar label", () => {
    const route = read("src/routes/spend-control-routes.ts");
    expect(route).toContain(
      'type SpendGuardScope = "plan_funded" | "free_simulation_allowance";',
    );
    expect(route).toContain('guardScope === "free_simulation_allowance"');
    expect(route).toContain("simulation_allowance_enabled:");
  });
});
