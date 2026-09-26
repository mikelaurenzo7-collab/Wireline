import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ENVIRONMENT_UNAVAILABLE,
  privateTextSimulationPolicy,
  privateVoiceSimulationPolicy,
} from "../src/lib/account-environment-policy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("private text simulation account admission", () => {
  it("allows every explicit account classification and fails closed on missing state", () => {
    for (const environment of ["production", "demo", "test"] as const) {
      expect(privateTextSimulationPolicy(environment)).toEqual({ allowed: true, environment });
      expect(privateVoiceSimulationPolicy(environment)).toEqual({ allowed: true, environment });
    }

    for (const environment of [null, undefined, "staging"]) {
      expect(privateTextSimulationPolicy(environment)).toMatchObject({
        allowed: false,
        environment: null,
        status: 503,
        code: ACCOUNT_ENVIRONMENT_UNAVAILABLE,
      });
      expect(privateVoiceSimulationPolicy(environment)).toMatchObject({
        allowed: false,
        environment: null,
        status: 503,
        code: ACCOUNT_ENVIRONMENT_UNAVAILABLE,
      });
    }
  });

  it("uses the simulation-specific cap without weakening live provider admission", () => {
    const route = read("src/routes/agent-test-routes.ts");
    const start = route.indexOf('"/api/agents/:id/test/stream"');
    const handler = route.indexOf("async (req: AuthenticatedRequest", start);
    const admission = route.slice(start, handler);

    expect(start).toBeGreaterThan(-1);
    expect(handler).toBeGreaterThan(start);
    expect(admission).toContain("enforcePrivateTextSimulationSpendCap");
    expect(admission).not.toMatch(/\benforceSpendCap\b/);

    const spendGuards = read("src/lib/spend-guards.ts");
    const liveStart = spendGuards.indexOf("export async function enforceSpendCap");
    const privateStart = spendGuards.indexOf(
      "export async function enforcePrivateTextSimulationSpendCap",
    );
    const liveGuard = spendGuards.slice(liveStart, privateStart);
    const privateGuard = spendGuards.slice(privateStart);

    expect(liveGuard).toContain("assertLiveExternalActionAllowed");
    expect(privateGuard).toContain("assertPrivateTextSimulationAllowed");
    expect(privateGuard).toContain("assertPrivateVoiceSimulationAllowed");
    expect(privateGuard).not.toContain("assertLiveExternalActionAllowed");
  });

  it("admits Studio Preview Voice through the private-voice cap, not the live spend fence", () => {
    const route = read("src/routes/live-voice-routes.ts");
    const start = route.indexOf('"/api/voice/live/session"');
    const handler = route.indexOf("async (req: AuthenticatedRequest", start);
    const admission = route.slice(start, handler);

    expect(start).toBeGreaterThan(-1);
    expect(handler).toBeGreaterThan(start);
    expect(admission).toContain("enforcePrivateVoiceSimulationSpendCap");
    expect(admission).not.toMatch(/\benforceSpendCap\b/);
    expect(admission).toContain("enforceVoiceLaunchHardGate");
    expect(admission).not.toMatch(/\benforceLaunchHardGate\b/);
    expect(admission).toContain("simulationMinuteQuota");

    const liveAgent = read("src/lib/voice/openai-live-agent-service.ts");
    expect(liveAgent).toContain('name: "search_agent_knowledge"');
    expect(liveAgent).toContain('if (input.name !== "search_agent_knowledge")');
    expect(liveAgent).toContain('admission: "private_simulation"');
    expect(liveAgent).not.toMatch(
      /sendTenantMessage|placeOutboundCall|sendEmail|purchaseNativeNumber/,
    );
  });

  it("keeps the Studio rehearsal text-only and non-dispatching", () => {
    const route = read("src/routes/agent-test-routes.ts");
    expect(route).toContain("This is a private browser roleplay with a prospective customer.");
    expect(route).toContain(
      "Do not claim a booking, transfer, message, payment, or other external action completed",
    );
    expect(route).toContain("This is a structured-output schema, not an executable agent tool.");
    expect(route).not.toMatch(
      /runOpenAILiveVoiceTool|executeAction|dispatchAction|sendTenantMessage/,
    );
  });
});
