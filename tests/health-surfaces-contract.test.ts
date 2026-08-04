import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { evaluatePlatformOperationalSlos } from "../src/lib/platform-operational-slos";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("health surfaces contract", () => {
  it("requires platform admin for integrations health", () => {
    const source = read("src/routes/health-routes.ts");
    expect(source).toMatch(/\/integrations"[\s\S]*requirePlatformAdmin/);
  });

  it("does not publish unconditional SLO availability claims", () => {
    const source = read("src/routes/health-routes.ts");
    expect(source).not.toContain("99.5%");
    expect(source).not.toContain("P0/P1 post-incident report within 72 hours");
    expect(source).toContain("evaluatePlatformOperationalSlos");
  });

  it("returns evidence-backed platform SLO statuses", () => {
    const ok = evaluatePlatformOperationalSlos({ dbOk: true, dbLatencyMs: 12 });
    expect(["ok", "degraded", "insufficient_data"]).toContain(ok.status);
    expect(ok.targets.availability.status).toBe("ok");
    expect(ok.targets.availability.evidence).toMatchObject({ db_ok: true });

    const degraded = evaluatePlatformOperationalSlos({ dbOk: false, dbLatencyMs: 4000 });
    expect(degraded.targets.availability.status).toBe("degraded");
  });

  it("uses platform-wide snapshot for admin and monitor SLO routes", () => {
    const source = read("src/routes/health-routes.ts");
    expect(source).toContain("getPlatformSloSnapshot");
    expect(source).not.toMatch(/getTenantSloSnapshot/);
  });

  it("keeps tenant tool status off the platform integrations health route", () => {
    const actionEngine = read("src/components/AgentActionEngine.tsx");
    expect(actionEngine).not.toContain("/api/health/integrations");
    expect(actionEngine).toContain("/api/oauth/crm/status");
  });

  it("accepts bounded browser error reports and forwards them to server telemetry", () => {
    const source = read("src/routes/health-routes.ts");
    const clientReporter = read("src/lib/sentry.ts");

    expect(clientReporter).toContain('"/api/health/report"');
    expect(source).toContain('router.post("/report"');
    expect(source).toContain("clientReportRateLimiter");
    expect(source).toContain("reportError(new Error(message)");
    expect(source).toContain("body.stack.slice(0, 4_000)");
  });

  it("routes standalone public health through the certified shared handler first", () => {
    const registration = read("src/server/register-api-routes.ts");
    const sharedImport =
      'import publicHealthHandler from "../entrypoints/public-health-api";';
    const exactRoute = 'app.all("/api/health/public"';
    const broadRouter = 'app.use("/api/health", healthRouter)';

    expect(registration).toContain(sharedImport);
    expect(registration).toContain(exactRoute);
    expect(registration).toContain("publicHealthHandler(req, res).catch(next)");
    expect(registration.indexOf(exactRoute)).toBeLessThan(registration.indexOf(broadRouter));
  });

  it("keeps public status single-owned and aborts timed-out authenticated model probes", () => {
    const source = read("src/routes/health-routes.ts");

    expect(source).not.toContain('router.get("/public"');
    expect(source).not.toContain("PUBLIC_PROBE_TTL_MS");
    expect(source).not.toContain("computePublicHealth");
    expect(source).toContain("const controller = new AbortController()");
    expect(source).toContain('controller.abort(new Error("model probe timed out"))');
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("clearTimeout(timeout)");
  });
});
