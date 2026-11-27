import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import type { Request, Response } from "express";

// Domain 1: /render
import {
  requiresRenderDeploymentGate,
  renderTrafficEnabled,
  requireRenderTraffic,
} from "../src/middleware/render-traffic";

// Domain 3: /resend
import {
  verifyResendWebhookSignature,
  resendWebhookSecretConfigured,
  RESEND_WEBHOOK_MAX_AGE_SECONDS,
} from "../src/lib/resend-webhook-signature";

// Domain 4: /agentmail
import { isBotBoundManagedEmailDomain } from "../src/lib/managed-agentmail-domain";
import { agentMailManagedInboxClientId, agentMailWebhookClientId } from "../src/lib/agentmail-mail";

// Domain 5: /twilio
import { getTwilioRestAuthMode } from "../src/lib/twilio-service-base";
import { evaluateTwilioWebhookAuth } from "../src/lib/twilio-webhook-auth";

// Domain 8: /xai
import {
  resolveXAIGrokVoiceModel,
  xaiVoiceForSavedVoice,
  toXAIRealtimeSession,
  XAI_GROK_VOICE_PINNED_MODEL,
} from "../src/lib/voice/xai-voice-config";

// Domain 9: /automation
import {
  checkUrlAllowed,
  parseNavigateTarget,
  isNonPublicAddress,
  isBlockedHostname,
} from "../src/lib/cloud-computer/url-policy";

describe("Challenger 2 — Security, Environment & Edge Case Empirical Suite", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://botbound.app");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Render Traffic Gate, Revisions, & Cron Authentication
  // ─────────────────────────────────────────────────────────────────────────────
  describe("1. Render Runtime Gate & Revision Invariants", () => {
    it("renderTrafficEnabled returns false when BOTBOUND_TRAFFIC_ENABLED is missing or not 'true'", () => {
      const mockEnv = {
        RENDER: "true",
        IS_PULL_REQUEST: "false",
        RENDER_SERVICE_NAME: "botbound-api",
        RENDER_GIT_BRANCH: "main",
        RENDER_GIT_COMMIT: "abcdef1234567890abcdef1234567890abcdef12",
        WIRELINE_DEPLOYMENT_ENVIRONMENT: "production",
        BOTBOUND_TRAFFIC_ENABLED: "false",
      };
      expect(renderTrafficEnabled(mockEnv as any)).toBe(false);
      expect(renderTrafficEnabled({ ...mockEnv, BOTBOUND_TRAFFIC_ENABLED: undefined } as any)).toBe(
        false,
      );
      expect(renderTrafficEnabled({ ...mockEnv, BOTBOUND_TRAFFIC_ENABLED: "true" } as any)).toBe(
        true,
      );
    });

    it("requiresRenderDeploymentGate triggers on provider render or conflict", () => {
      expect(requiresRenderDeploymentGate({ RENDER: "true" } as any)).toBe(true);
      expect(requiresRenderDeploymentGate({ VERCEL: "1", RENDER: "true" } as any)).toBe(true);
      expect(requiresRenderDeploymentGate({} as any)).toBe(false);
    });

    it("requireRenderTraffic serves /healthz with alive:true even when traffic is disabled", () => {
      vi.stubEnv("RENDER", "true");
      vi.stubEnv("IS_PULL_REQUEST", "false");
      vi.stubEnv("RENDER_SERVICE_NAME", "botbound-api");
      vi.stubEnv("RENDER_GIT_BRANCH", "main");
      vi.stubEnv("RENDER_GIT_COMMIT", "abcdef1234567890abcdef1234567890abcdef12");
      vi.stubEnv("WIRELINE_DEPLOYMENT_ENVIRONMENT", "production");
      vi.stubEnv("BOTBOUND_TRAFFIC_ENABLED", "false");

      let jsonResponse: any = null;
      const req = {
        method: "GET",
        path: "/healthz",
        get: () => undefined,
      } as unknown as Request;

      const res = {
        setHeader: vi.fn(),
        json: (val: any) => {
          jsonResponse = val;
        },
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      const next = vi.fn();
      requireRenderTraffic(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(jsonResponse).toEqual({
        alive: true,
        trafficEnabled: false,
        sourceCommit: "abcdef1234567890abcdef1234567890abcdef12",
      });
    });

    it("requireRenderTraffic returns 409 when x-botbound-expected-source-revision does not match deployed commit", () => {
      vi.stubEnv("RENDER", "true");
      vi.stubEnv("IS_PULL_REQUEST", "false");
      vi.stubEnv("RENDER_SERVICE_NAME", "botbound-api");
      vi.stubEnv("RENDER_GIT_BRANCH", "main");
      vi.stubEnv("RENDER_GIT_COMMIT", "abcdef1234567890abcdef1234567890abcdef12");
      vi.stubEnv("WIRELINE_DEPLOYMENT_ENVIRONMENT", "production");
      vi.stubEnv("BOTBOUND_TRAFFIC_ENABLED", "true");

      let statusCalled: number | null = null;
      let jsonResponse: any = null;
      const req = {
        method: "POST",
        path: "/api/cron/sweep",
        get: (header: string) =>
          header.toLowerCase() === "x-botbound-expected-source-revision"
            ? "1234567890abcdef1234567890abcdef12345678"
            : undefined,
      } as unknown as Request;

      const res = {
        setHeader: vi.fn(),
        status: (code: number) => {
          statusCalled = code;
          return {
            json: (val: any) => {
              jsonResponse = val;
            },
          };
        },
      } as unknown as Response;

      const next = vi.fn();
      requireRenderTraffic(req, res, next);

      expect(statusCalled).toBe(409);
      expect(jsonResponse.code).toBe("DEPLOYMENT_REVISION_MISMATCH");
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Resend & Svix Webhook Cryptographic Verification & Replay Bounds
  // ─────────────────────────────────────────────────────────────────────────────
  describe("3. Resend & Svix Webhook Security & Replay Tolerance", () => {
    const rawSecret = "whsec_MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1234567890abcdef1234567890abcdef";
    const body = Buffer.from(JSON.stringify({ type: "email.delivered", data: { id: "msg_123" } }));
    const webhookId = "msg_svix_test_001";

    it("validates that resendWebhookSecretConfigured requires a valid base64 key ≥ 16 bytes", () => {
      expect(resendWebhookSecretConfigured(rawSecret)).toBe(true);
      expect(resendWebhookSecretConfigured("")).toBe(false);
      expect(resendWebhookSecretConfigured("whsec_short")).toBe(false);
      expect(resendWebhookSecretConfigured("invalid!base64!!")).toBe(false);
    });

    it("verifies authentic Svix signature successfully", () => {
      const now = Math.floor(Date.now() / 1000);
      const secretBytes = Buffer.from(rawSecret.replace("whsec_", ""), "base64");
      const signed = Buffer.concat([Buffer.from(`${webhookId}.${now}.`, "utf8"), body]);
      const signature = createHmac("sha256", secretBytes).update(signed).digest("base64");

      const result = verifyResendWebhookSignature(
        body,
        {
          "svix-id": webhookId,
          "svix-timestamp": String(now),
          "svix-signature": `v1,${signature}`,
        },
        rawSecret,
        now,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.webhookId).toBe(webhookId);
        expect(result.timestamp).toBe(now);
      }
    });

    it("rejects webhook replay older than 5 minutes (RESEND_WEBHOOK_MAX_AGE_SECONDS)", () => {
      const now = Math.floor(Date.now() / 1000);
      const staleTimestamp = now - (RESEND_WEBHOOK_MAX_AGE_SECONDS + 10); // 5m 10s ago

      const secretBytes = Buffer.from(rawSecret.replace("whsec_", ""), "base64");
      const signed = Buffer.concat([Buffer.from(`${webhookId}.${staleTimestamp}.`, "utf8"), body]);
      const signature = createHmac("sha256", secretBytes).update(signed).digest("base64");

      const result = verifyResendWebhookSignature(
        body,
        {
          "svix-id": webhookId,
          "svix-timestamp": String(staleTimestamp),
          "svix-signature": `v1,${signature}`,
        },
        rawSecret,
        now,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("stale_timestamp");
      }
    });

    it("rejects webhook with tampered body or invalid signature", () => {
      const now = Math.floor(Date.now() / 1000);
      const secretBytes = Buffer.from(rawSecret.replace("whsec_", ""), "base64");
      const signed = Buffer.concat([Buffer.from(`${webhookId}.${now}.`, "utf8"), body]);
      const signature = createHmac("sha256", secretBytes).update(signed).digest("base64");

      const tamperedBody = Buffer.from(
        JSON.stringify({ type: "email.delivered", data: { id: "tampered" } }),
      );

      const result = verifyResendWebhookSignature(
        tamperedBody,
        {
          "svix-id": webhookId,
          "svix-timestamp": String(now),
          "svix-signature": `v1,${signature}`,
        },
        rawSecret,
        now,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid_signature");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. AgentMail Domain Isolation & Deterministic Client IDs
  // ─────────────────────────────────────────────────────────────────────────────
  describe("4. AgentMail Domain Isolation & Client ID Idempotency", () => {
    it("isBotBoundManagedEmailDomain allows bots.botbound.app and mail.botbound.app", () => {
      expect(isBotBoundManagedEmailDomain("bots.botbound.app")).toBe(true);
      expect(isBotBoundManagedEmailDomain("mail.botbound.app")).toBe(true);
      expect(isBotBoundManagedEmailDomain("botbound.app")).toBe(true);
    });

    it("isBotBoundManagedEmailDomain rejects foreign or spoofed domains", () => {
      expect(isBotBoundManagedEmailDomain("gmail.com")).toBe(false);
      expect(isBotBoundManagedEmailDomain("attacker-botbound.app.evil.com")).toBe(false);
      expect(isBotBoundManagedEmailDomain("evilbotbound.app")).toBe(false);
      expect(isBotBoundManagedEmailDomain("")).toBe(false);
    });

    it("agentMailManagedInboxClientId produces deterministic, collision-resistant IDs", () => {
      const id1 = agentMailManagedInboxClientId("agent-123", "bots.botbound.app");
      const id2 = agentMailManagedInboxClientId("agent-123", "bots.botbound.app");
      const id3 = agentMailManagedInboxClientId("agent-456", "bots.botbound.app");

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1.startsWith("botbound-agent-")).toBe(true);
      expect(id1.length).toBe("botbound-agent-".length + 32);
    });

    it("agentMailWebhookClientId generates distinct client IDs for distinct destinations", () => {
      const hook1 = agentMailWebhookClientId("acc-1", "https://botbound.app/api/agentmail-webhook");
      const hook2 = agentMailWebhookClientId("acc-1", "https://botbound.app/api/agentmail-webhook");
      const hook3 = agentMailWebhookClientId(
        "acc-1",
        "https://botbound.app/api/agentmail-webhook-new",
      );

      expect(hook1).toBe(hook2);
      expect(hook1).not.toBe(hook3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Twilio Auth Modes & Webhook Fail-Closed Behavior
  // ─────────────────────────────────────────────────────────────────────────────
  describe("5. Twilio Auth Hierarchy & Security Guards", () => {
    it("getTwilioRestAuthMode prefers scoped API key over root Auth Token", () => {
      vi.stubEnv("TWILIO_ACCOUNT_SID", "AC11111111111111111111111111111111");
      vi.stubEnv("TWILIO_API_KEY", "SK11111111111111111111111111111111");
      vi.stubEnv("TWILIO_API_SECRET", "secret11111111111111111111111111111111");
      vi.stubEnv("TWILIO_AUTH_TOKEN", "root_auth_token_32_characters_here");

      expect(getTwilioRestAuthMode()).toBe("api_key");
    });

    it("getTwilioRestAuthMode falls back to auth_token only if API key/secret are unset", () => {
      vi.stubEnv("TWILIO_ACCOUNT_SID", "AC11111111111111111111111111111111");
      vi.stubEnv("TWILIO_API_KEY", "");
      vi.stubEnv("TWILIO_API_SECRET", "");
      vi.stubEnv("TWILIO_AUTH_TOKEN", "root_auth_token_32_characters_here");

      expect(getTwilioRestAuthMode()).toBe("auth_token");
    });

    it("evaluateTwilioWebhookAuth strictly rejects dev bypass in production runtime", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("TWILIO_WEBHOOK_DISABLE_AUTH", "1");
      vi.stubEnv("TWILIO_AUTH_TOKEN", "");

      const req = {
        method: "POST",
        headers: {},
        body: {},
        originalUrl: "/api/twilio-voice/inbound",
      } as unknown as Request;

      const evalResult = evaluateTwilioWebhookAuth(req);
      expect(evalResult.ok).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. xAI Grok Models & Voice Safety
  // ─────────────────────────────────────────────────────────────────────────────
  describe("8. xAI Grok Models & Voice Configuration Invariants", () => {
    it("resolveXAIGrokVoiceModel defaults to pinned model grok-voice-3.0", () => {
      expect(XAI_GROK_VOICE_PINNED_MODEL).toBe("grok-voice-3.0");
      expect(resolveXAIGrokVoiceModel({} as any)).toBe("grok-voice-3.0");
    });

    it("xaiVoiceForSavedVoice maps legacy OpenAI voices to appropriate Grok voices", () => {
      expect(xaiVoiceForSavedVoice("marin")).toBe("carina");
      expect(xaiVoiceForSavedVoice("cedar")).toBe("castor");
      expect(xaiVoiceForSavedVoice("alloy")).toBe("aurora");
      expect(xaiVoiceForSavedVoice("unknown_voice")).toBe("carina"); // safe fallback
    });

    it("toXAIRealtimeSession sanitizes unsupported OpenAI-specific keys", () => {
      const openAISession = {
        model: "gpt-realtime-2.1",
        instructions: "Be helpful",
        voice: "marin",
        noise_reduction: { enabled: true }, // OpenAI only
        semantic_vad: true, // OpenAI only
        tools: [{ type: "function", name: "test_tool" }, { type: "code_interpreter" }],
      };

      const xaiSession = toXAIRealtimeSession(openAISession as any);
      expect(xaiSession.model).toBe("grok-voice-3.0");
      expect(xaiSession.voice).toBe("carina");
      expect((xaiSession as any).noise_reduction).toBeUndefined();
      expect((xaiSession as any).semantic_vad).toBeUndefined();
      // Only function tools preserved
      expect((xaiSession.tools as any[]).length).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Browserbase Automation & SSRF Network Protection
  // ─────────────────────────────────────────────────────────────────────────────
  describe("9. Browserbase & SSRF Cloud Computer Guards", () => {
    it("blocks private IPv4 spaces and loopback addresses", () => {
      expect(isNonPublicAddress("127.0.0.1")).toBe(true);
      expect(isNonPublicAddress("10.0.0.1")).toBe(true);
      expect(isNonPublicAddress("192.168.1.1")).toBe(true);
      expect(isNonPublicAddress("172.16.0.1")).toBe(true);
      expect(isNonPublicAddress("169.254.169.254")).toBe(true); // AWS/GCP metadata
      expect(isNonPublicAddress("100.64.0.1")).toBe(true); // Carrier-grade NAT
      expect(isNonPublicAddress("0.0.0.0")).toBe(true);
    });

    it("blocks IPv6 loopback, link-local, unique-local, and NAT64 local translation", () => {
      expect(isNonPublicAddress("::1")).toBe(true);
      expect(isNonPublicAddress("fe80::1")).toBe(true); // Link-local
      expect(isNonPublicAddress("fc00::1")).toBe(true); // Unique local
      expect(isNonPublicAddress("::ffff:127.0.0.1")).toBe(true); // IPv4-mapped loopback
      expect(isNonPublicAddress("64:ff9b:1::192.168.1.1")).toBe(true); // RFC 8215 local NAT64
    });

    it("allows public routable IP addresses", () => {
      expect(isNonPublicAddress("8.8.8.8")).toBe(false); // Google DNS
      expect(isNonPublicAddress("1.1.1.1")).toBe(false); // Cloudflare DNS
      expect(isNonPublicAddress("140.82.121.4")).toBe(false); // GitHub
    });

    it("isBlockedHostname detects cloud metadata and private search suffixes", () => {
      expect(isBlockedHostname("localhost")).toBe(true);
      expect(isBlockedHostname("metadata")).toBe(true);
      expect(isBlockedHostname("metadata.google.internal")).toBe(true);
      expect(isBlockedHostname("instance-data")).toBe(true);
      expect(isBlockedHostname("app.onrender-internal")).toBe(true);
      expect(isBlockedHostname("service.internal")).toBe(true);
      expect(isBlockedHostname("printer.local")).toBe(true);
      expect(isBlockedHostname("singleword")).toBe(true); // Single label
      expect(isBlockedHostname("botbound.app")).toBe(false);
      expect(isBlockedHostname("google.com")).toBe(false);
    });

    it("checkUrlAllowed refuses non-standard ports and credentials embedded in URL", () => {
      const urlWithCreds = new URL("https://admin:pass@example.com");
      expect(checkUrlAllowed(urlWithCreds).allowed).toBe(false);

      const sshPort = new URL("https://example.com:22");
      expect(checkUrlAllowed(sshPort).allowed).toBe(false);

      const redisPort = new URL("https://example.com:6379");
      expect(checkUrlAllowed(redisPort).allowed).toBe(false);

      const allowedPort = new URL("https://example.com:443");
      expect(checkUrlAllowed(allowedPort).allowed).toBe(true);

      const allowedPort8080 = new URL("https://example.com:8080");
      expect(checkUrlAllowed(allowedPort8080).allowed).toBe(true);
    });

    it("parseNavigateTarget rejects javascript:, data:, and file: schemes", () => {
      expect(parseNavigateTarget("javascript:alert(1)").kind).toBe("refused");
      expect(parseNavigateTarget("data:text/html,evil").kind).toBe("refused");
      expect(parseNavigateTarget("file:///etc/passwd").kind).toBe("refused");
    });
  });
});
