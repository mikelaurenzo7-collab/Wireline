import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("job sweep cron authorization", () => {
  it("never admits tenant credentials to the global maintenance lease", () => {
    const routes = readFileSync(resolve(process.cwd(), "src/routes/job-routes.ts"), "utf8");
    const start = routes.indexOf("const cronAuth =");
    const end = routes.indexOf("const runSweepHandler =", start);
    const authGate = routes.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(authGate).toContain('req._sweepMode = "cron"');
    expect(authGate).toContain("Valid cron authorization required");
    expect(authGate).not.toContain("authenticateUser");
    expect(authGate).not.toContain("getCallerRole");
    expect(routes).not.toContain('req._sweepMode = "manual"');
  });
});
