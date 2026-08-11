import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/insights/AISpendView.tsx"),
  "utf8",
);

describe("Free Builder spend UI truth", () => {
  it("uses the server-owned guard scope rather than inferring from dollars", () => {
    expect(source).toContain('type SpendGuardScope = "free_simulation_allowance" | "plan_funded";');
    expect(source).toContain('status?.guard_scope === "free_simulation_allowance"');
    expect(source).toContain("plan_name?: string;");
    expect(source).toContain("live_provider_work_enabled?: boolean;");
    expect(source).toContain("simulation_allowance_enabled?: boolean;");
  });

  it("labels Free Builder as private simulation, not a paid provider envelope", () => {
    expect(source).toContain('"Simulation allowance"');
    expect(source).toContain(
      "Funds private setup, training, and simulation. Activate a paid plan to go live.",
    );
    expect(source).toContain(
      "Private setup, training, and simulation pause at the monthly allowance. Live provider work requires a paid plan.",
    );
  });

  it("keeps paid-plan provider spend language intact", () => {
    expect(source).toContain('"Provider spend guard"');
    expect(source).toContain("provider-cost envelope funded by the plan");
    expect(source).toContain("Completed in-flight work still settles.");
  });
});
