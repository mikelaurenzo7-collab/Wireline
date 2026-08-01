import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { AGENT_TOOL_CATALOG } from "../src/lib/agent-capabilities";
import { buyerTierForIntegration } from "../src/lib/integrations-certification";
import { validatePlaybookCoverage } from "../src/lib/integration-playbooks";
import {
  RUNTIME_INTEGRATIONS,
  getRuntimeCapabilities,
} from "../src/lib/runtime-integrations-registry";
import {
  WORKSPACE_INTEGRATION_CATALOG,
  workspaceCatalogCoversIntegration,
} from "../src/lib/workspace-integration-catalog";

describe("integration vendor operating map", () => {
  it("keeps authenticated integration UI operational instead of explanatory", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/components/integrations/IntegrationOperatingMap.tsx",
      ),
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
      expect(["live", "beta", "planned", "platform"]).toContain(
        entry.readiness,
      );
    }
  });

  it("covers every integration-scoped agent tool in the user-facing operating map", () => {
    const toolIntegrations = new Set(
      AGENT_TOOL_CATALOG.map((tool) => tool.integration).filter(Boolean),
    );

    const missing = [...toolIntegrations].filter(
      (integration) =>
        integration && !workspaceCatalogCoversIntegration(integration),
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
        "elevenlabs",
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

    expect(
      RUNTIME_INTEGRATIONS.find((entry) => entry.id === "drizzle")?.label,
    ).toBe("Supabase Postgres");
    expect(
      RUNTIME_INTEGRATIONS.map((entry) => entry.label).join(" "),
    ).not.toContain("Vercel Postgres");
    expect(
      RUNTIME_INTEGRATIONS.find((entry) => entry.id === "docusign")
        ?.oneOfEnvVars,
    ).toEqual([["DOCUSIGN_ACCESS_TOKEN", "DOCUSIGN_JWT_TOKEN"]]);
    expect(
      RUNTIME_INTEGRATIONS.find((entry) => entry.id === "ai-gateway")
        ?.oneOfEnvVars,
    ).toEqual([["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"]]);
  });

  it("keeps environment and launch gates aligned with the OpenAI-first funded runtime", () => {
    const envValidator = readFileSync(
      resolve(process.cwd(), "src/lib/env-validator.ts"),
      "utf8",
    );
    const launchReadiness = readFileSync(
      resolve(process.cwd(), "src/lib/launch-readiness.ts"),
      "utf8",
    );

    expect(envValidator).toContain('name: "XAI_API_KEY"');
    expect(envValidator).toContain('name: "OPENAI_API_KEY"');
    expect(envValidator).toContain('name: "AI_GATEWAY_API_KEY"');
    expect(envValidator).toContain('name: "ELEVENLABS_API_KEY"');
    expect(envValidator).toContain("const managedRuntime");
    expect(envValidator).toContain(
      "Primary managed reasoning and OpenAI Realtime credential",
    );
    expect(envValidator).toContain("Optional xAI experiment credential");
    expect(envValidator).not.toContain("const directRuntime");
    expect(launchReadiness).toContain("TWILIO_ACCOUNT_SID+TWILIO_AUTH_TOKEN");
    expect(launchReadiness).toContain("PSTN voice + number stack");
  });

  it("refuses to report federal DNC configured on credential shape the runtime rejects", () => {
    // Presence-only registry checks previously diverged from
    // isFederalDncVendorConfigured(): a pasted Vercel token or an http URL
    // read as "configured" in /api/health/internal while campaign outbound
    // stayed fail-closed. The registry must apply the runtime's rule.
    const saved = {
      url: process.env.FEDERAL_DNC_API_URL,
      key: process.env.FEDERAL_DNC_API_KEY,
    };
    try {
      process.env.FEDERAL_DNC_API_URL =
        "https://www.dncscrub.com/app/main/rpc/scrub";
      process.env.FEDERAL_DNC_API_KEY = "vcp_not_a_dnc_credential";
      expect(getRuntimeCapabilities().federal_dnc).toBe(false);

      process.env.FEDERAL_DNC_API_KEY = "real-login-id";
      process.env.FEDERAL_DNC_API_URL =
        "http://www.dncscrub.com/app/main/rpc/scrub";
      expect(getRuntimeCapabilities().federal_dnc).toBe(false);

      process.env.FEDERAL_DNC_API_URL =
        "https://www.dncscrub.com/app/main/rpc/scrub";
      expect(getRuntimeCapabilities().federal_dnc).toBe(true);
    } finally {
      if (saved.url === undefined) delete process.env.FEDERAL_DNC_API_URL;
      else process.env.FEDERAL_DNC_API_URL = saved.url;
      if (saved.key === undefined) delete process.env.FEDERAL_DNC_API_KEY;
      else process.env.FEDERAL_DNC_API_KEY = saved.key;
    }
  });

  it("follows the runtime's Perplexity key policy instead of raw presence", () => {
    // Production Perplexity keys are intentionally inert on Vercel previews
    // (src/lib/perplexity-platform.ts); the registry must not report the
    // integration configured from a key the runtime refuses to use.
    const saved = {
      vercelEnv: process.env.VERCEL_ENV,
      key: process.env.PERPLEXITY_API_KEY,
      previewKey: process.env.PERPLEXITY_PREVIEW_API_KEY,
    };
    try {
      process.env.VERCEL_ENV = "preview";
      process.env.PERPLEXITY_API_KEY = "pplx-production-key";
      delete process.env.PERPLEXITY_PREVIEW_API_KEY;
      expect(getRuntimeCapabilities().perplexity).toBe(false);

      process.env.PERPLEXITY_PREVIEW_API_KEY = "pplx-preview-key";
      expect(getRuntimeCapabilities().perplexity).toBe(true);

      process.env.VERCEL_ENV = "production";
      delete process.env.PERPLEXITY_PREVIEW_API_KEY;
      expect(getRuntimeCapabilities().perplexity).toBe(true);
    } finally {
      for (const [name, value] of [
        ["VERCEL_ENV", saved.vercelEnv],
        ["PERPLEXITY_API_KEY", saved.key],
        ["PERPLEXITY_PREVIEW_API_KEY", saved.previewKey],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
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
