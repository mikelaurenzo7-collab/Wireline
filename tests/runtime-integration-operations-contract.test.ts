import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buyerTierForIntegration } from "../src/lib/integrations-certification";
import { validatePlaybookCoverage } from "../src/lib/integration-playbooks";
import { UNVERIFIED_LIVE_TOOL_NAMES } from "../src/lib/unverified-live-tools";
import {
  RUNTIME_INTEGRATIONS,
  getRuntimeCapabilities,
} from "../src/lib/runtime-integrations-registry";

describe("runtime integration operations", () => {
  it("covers available integration tools without advertising private live reads or unavailable payments", () => {
    const withheld = new Set([...UNVERIFIED_LIVE_TOOL_NAMES, "square_send_invoice"]);
    const gaps = validatePlaybookCoverage();
    expect(gaps.filter((name) => !withheld.has(name))).toEqual([]);
    expect(new Set(gaps)).toEqual(
      new Set([
        "crm_search_contacts",
        "crm_log_call",
        "square_lookup_order",
        "square_lookup_customer",
        "square_create_payment_link",
        "square_send_invoice",
      ]),
    );
  });

  it("keeps runtime vendor truth aligned with the actual platform", () => {
    const ids = RUNTIME_INTEGRATIONS.map((entry) => entry.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        "drizzle",
        "openai",
        "gemini",
        "ai-gateway",
        "twilio",
        "stripe",
        "resend",
        "resend-feedback",
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
    expect(RUNTIME_INTEGRATIONS.find((entry) => entry.id === "elevenlabs")).toBeUndefined();
  });

  it("keeps environment and launch gates aligned with the OpenAI-first funded runtime", () => {
    const envValidator = readFileSync(resolve(process.cwd(), "src/lib/env-validator.ts"), "utf8");
    const launchReadiness = readFileSync(
      resolve(process.cwd(), "src/lib/launch-readiness.ts"),
      "utf8",
    );

    expect(envValidator).not.toContain('name: "XAI_API_KEY"');
    expect(envValidator).toContain('name: "OPENAI_API_KEY"');
    expect(envValidator).toContain('name: "AI_GATEWAY_API_KEY"');
    expect(envValidator).not.toContain('name: "ELEVENLABS_API_KEY"');
    expect(envValidator).toContain("const retiredVoiceEnv");
    expect(envValidator).toContain('"ELEVENLABS_API_KEY",');
    expect(envValidator).toContain("const managedRuntime");
    expect(envValidator).toContain("Managed structured reasoning and OpenAI Realtime credential");
    expect(envValidator).toContain("managed OpenAI GPT-5.6 Terra default");
    expect(envValidator).toContain('name: "WIRELINE_STRUCTURED_PRIMARY_PROVIDER"');
    expect(envValidator).not.toContain("const directRuntime");
    expect(launchReadiness).toContain("TWILIO_ACCOUNT_SID+TWILIO_AUTH_TOKEN");
    expect(launchReadiness).toContain("PSTN voice + Twilio number stack");
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
      process.env.FEDERAL_DNC_API_URL = "https://www.dncscrub.com/app/main/rpc/scrub";
      process.env.FEDERAL_DNC_API_KEY = "vcp_not_a_dnc_credential";
      expect(getRuntimeCapabilities().federal_dnc).toBe(false);

      process.env.FEDERAL_DNC_API_KEY = "real-login-id";
      process.env.FEDERAL_DNC_API_URL = "http://www.dncscrub.com/app/main/rpc/scrub";
      expect(getRuntimeCapabilities().federal_dnc).toBe(false);

      process.env.FEDERAL_DNC_API_URL = "https://www.dncscrub.com/app/main/rpc/scrub";
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

  it("reports Preview Gateway missing when only automatic OIDC is present", () => {
    const saved = {
      vercelEnv: process.env.VERCEL_ENV,
      gatewayKey: process.env.AI_GATEWAY_API_KEY,
      oidc: process.env.VERCEL_OIDC_TOKEN,
    };
    try {
      process.env.VERCEL_ENV = "preview";
      delete process.env.AI_GATEWAY_API_KEY;
      process.env.VERCEL_OIDC_TOKEN = "automatic-preview-oidc";
      expect(getRuntimeCapabilities().ai_gateway).toBe(false);

      process.env.VERCEL_ENV = "production";
      expect(getRuntimeCapabilities().ai_gateway).toBe(true);
    } finally {
      for (const [name, value] of [
        ["VERCEL_ENV", saved.vercelEnv],
        ["AI_GATEWAY_API_KEY", saved.gatewayKey],
        ["VERCEL_OIDC_TOKEN", saved.oidc],
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
