import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Studio backend reliability contract", () => {
  const agentRoutes = read("src/routes/agent-routes-v2.ts");
  const testRoutes = read("src/routes/agent-test-routes.ts");
  const rateLimits = read("src/middleware/api-rate-limits.ts");

  it("saves setup essentials together for the authenticated agent", () => {
    expect(agentRoutes).toMatch(/router\.patch\([\s\S]*\/api\/agent-config\/:id\/essentials/);
    expect(agentRoutes).toMatch(/drizzle\.transaction/);
    expect(agentRoutes).toMatch(/eq\(schema\.agents\.userId, req\.user\.id\)/);
    expect(agentRoutes).toMatch(/\.set\(\{ firstMessage \}\)/);
    expect(agentRoutes).toMatch(/CUSTOMER_FACING_JOB_PREFIX/);
    expect(agentRoutes).toMatch(/priority: 100/);
    expect(agentRoutes).not.toMatch(/\.set\(\{ role: job, firstMessage \}\)/);
    expect(agentRoutes).toMatch(/schema\.personality\.agentId/);
    expect(agentRoutes).toMatch(/opening greeting:%/);
    expect(agentRoutes).toMatch(/lower\(btrim\(\$\{schema\.knowledge\.content\}\)\)/);
  });

  it("returns canonical greeting, effective phone voice, counts, and last browser test", () => {
    expect(agentRoutes).toMatch(/firstMessage/);
    expect(agentRoutes).toMatch(/effectivePhoneVoiceId/);
    expect(agentRoutes).toMatch(/directiveCount: directives\.filter/);
    expect(agentRoutes).toMatch(/knowledgeCount: knowledge\.length/);
    expect(agentRoutes).toMatch(/lastBrowserTestAt/);
  });

  it("bounds and cancels each per-user customer roleplay", () => {
    expect(testRoutes).toMatch(/agentTestRateLimit/);
    expect(rateLimits).toMatch(/bucket: "api:agent-test"/);
    expect(rateLimits).toMatch(/rateLimit\(userId, opts\)/);
    expect(testRoutes).toMatch(/buildBoundedAgentTestPrompt/);
    expect(testRoutes).toMatch(/sse\.onClientDisconnect\(\(\) => abortController\.abort\(\)\)/);
    expect(testRoutes).toMatch(/res\.once\("close", \(\) => abortController\.abort\(\)\)/);
    expect(testRoutes).toMatch(/signal: abortController\.signal/);
    expect(testRoutes).not.toMatch(/onResult:.*sse\.write\("reply"/);
    expect(testRoutes).toMatch(/event: "test_call_started"/);
    expect(testRoutes).toMatch(/event: "test_call_completed"/);
    expect(testRoutes).toMatch(/await persistServerProductEvent/);
    expect(testRoutes.indexOf("await persistServerProductEvent")).toBeLessThan(
      testRoutes.indexOf('sse.write("done"'),
    );
  });
});
