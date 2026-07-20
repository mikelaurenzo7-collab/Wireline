import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { AGENT_TOOL_CATALOG } from "../src/lib/agent-capabilities";
import { buyerTierForIntegration } from "../src/lib/integrations-certification";
import { validatePlaybookCoverage } from "../src/lib/integration-playbooks";
import { RUNTIME_INTEGRATIONS } from "../src/lib/runtime-integrations-registry";
import {
  WORKSPACE_INTEGRATION_CATALOG,
  workspaceCatalogCoversIntegration,
} from "../src/lib/workspace-integration-catalog";

describe("integration vendor operating map", () => {
  it("keeps authenticated integration UI operational instead of explanatory", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/integrations/IntegrationOperatingMap.tsx"),
      "utf8",
    );

    expect(source).not.toContain("entry.purpose");
    expect(source).not.toContain("entry.detail");
    expect(source).not.toContain("entry.agentScope");
    expect(source).not.toContain("entry.guardrail");
    expect(source).not.toContain("entry.nextStep");
  });

  it("keeps canonical connector metadata complete", () => {
    expect(WORKSPACE_INTEGRATION_CATALOG.length).toBeGreaterThanOrEqual(16);

    for (const entry of WORKSPACE_INTEGRATION_CATALOG) {
      expect(entry.label).toBeTruthy();
      expect(entry.family).toBeTruthy();
      expect(entry.purpose.length).toBeGreaterThan(24);
      expect(entry.agentScope.length).toBeGreaterThan(24);
      expect(entry.guardrail.length).toBeGreaterThan(24);
      expect(entry.nextStep.length).toBeGreaterThan(24);
      expect(entry.capabilities.length).toBeGreaterThan(0);
      expect(["live", "beta", "planned", "platform"]).toContain(entry.readiness);
    }
  });

  it("covers every integration-scoped agent tool in the user-facing operating map", () => {
    const toolIntegrations = new Set(
      AGENT_TOOL_CATALOG.map((tool) => tool.integration).filter(Boolean),
    );

    const missing = [...toolIntegrations].filter(
      (integration) => integration && !workspaceCatalogCoversIntegration(integration),
    );

    expect(missing).toEqual([]);
    expect(validatePlaybookCoverage()).toEqual([]);
  });

  it("keeps runtime vendor truth aligned with the actual platform", () => {
    const ids = RUNTIME_INTEGRATIONS.map((entry) => entry.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        "drizzle",
        "xai",
        "openai",
        "gemini",
        "ai-gateway",
        "vapi",
        "twilio",
        "deepgram-flux",
        "openai-realtime",
        "liveavatar",
        "heygen",
        "stripe",
        "resend",
        "docusign",
        "x-ads",
        "chatgpt-mcp",
        "secret-vault",
        "pwned-passwords",
      ]),
    );

    expect(RUNTIME_INTEGRATIONS.find((entry) => entry.id === "drizzle")?.label).toBe(
      "Supabase Postgres",
    );
    expect(RUNTIME_INTEGRATIONS.map((entry) => entry.label).join(" ")).not.toContain(
      "Vercel Postgres",
    );
    expect(RUNTIME_INTEGRATIONS.find((entry) => entry.id === "docusign")?.oneOfEnvVars).toEqual([
      ["DOCUSIGN_ACCESS_TOKEN", "DOCUSIGN_JWT_TOKEN"],
    ]);
    expect(RUNTIME_INTEGRATIONS.find((entry) => entry.id === "ai-gateway")?.oneOfEnvVars).toEqual([
      ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"],
    ]);
  });

  it("keeps environment and launch gates aligned with the OpenAI-first funded runtime", () => {
    const envValidator = readFileSync(resolve(process.cwd(), "src/lib/env-validator.ts"), "utf8");
    const launchReadiness = readFileSync(
      resolve(process.cwd(), "src/lib/launch-readiness.ts"),
      "utf8",
    );

    expect(envValidator).toContain("process.env.OPENAI_API_KEY");
    expect(envValidator).toContain("process.env.AI_GATEWAY_API_KEY");
    expect(envValidator).toContain("const managedRuntime");
    expect(envValidator).toContain(
      "Optional xAI experiment credential; not part of the launch default",
    );
    expect(envValidator).not.toContain("const directRuntime");
    expect(launchReadiness).toContain("TWILIO_ACCOUNT_SID+TWILIO_AUTH_TOKEN");
    expect(launchReadiness).toContain("PSTN voice + number stack");
  });

  it("classifies buyer-facing runtime connectors with current registry ids", () => {
    expect(buyerTierForIntegration("google-workspace")).toBe("certified");
    expect(buyerTierForIntegration("microsoft-365")).toBe("certified");
    expect(buyerTierForIntegration("twilio")).toBe("certified");
    expect(buyerTierForIntegration("docusign")).toBe("beta");
    expect(buyerTierForIntegration("x-ads")).toBe("beta");
    expect(buyerTierForIntegration("yahoo")).toBe("beta");
  });
});
