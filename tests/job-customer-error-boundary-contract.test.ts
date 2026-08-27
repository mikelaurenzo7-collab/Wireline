import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("job customer error boundary", () => {
  it("keeps stored provider failures private while returning purposeful BotBound errors", () => {
    const routes = read("src/routes/job-routes.ts");

    expect(routes).toContain("function publicJobFailureMessage");
    expect(routes).toContain("BotBound could not create this file. Try again shortly.");
    expect(routes).toContain("BotBound could not complete this job. Try again shortly.");
    expect(routes).toContain("error: publicJobFailureMessage(row)");
    expect(routes).toContain("error: publicJobFailureMessage(done)");
    expect(routes).not.toContain("error: failed?.error ?? getErrorMessage(runErr)");
    expect(routes).not.toContain("result: done?.result, error: done?.error");
  });
});
