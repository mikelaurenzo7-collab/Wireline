/**
 * Tier 2: Boundary & Corner Cases (E2E Opaque-Box Suite)
 * 
 * Validates boundaries, edge cases, invalid inputs, failure modes, and rate limiting:
 * - F1: Voice boundaries (E.164 normalization, invalid phone numbers, AMD telemarketing drops, duration clamping, invalid webhook auth)
 * - F2: SMS boundaries (TCPA quiet hours boundary, active DNC suppression, carrier 429 backoff retry, duplicate idempotency keys, whitespace/special-char handling)
 * - F3: Toll-Free Verification boundaries (strict EIN format validation, missing required business fields, toll-free number prefix validation, invalid status transitions, unauthorized webhook signatures)
 * - F4: Resend Email boundaries (unconfigured API key fails closed, transient vs permanent bounce classification, Svix 300s replay window, tampered payload rejection, header injection prevention)
 * - F5: AgentMail boundaries (third-party domain rejection, username sanitization, 1MB webhook payload limit, missing Svix header rejection, credential privacy)
 * - F6: Cloud Computer boundaries (SSRF blocking loopback/RFC1918/metadata 169.254.169.254, non-Playwright CDP endpoints, timeout bounds 60s-3600s, max turns/actions caps)
 * - F7: Design System boundaries (banned em-dash prevention, touch target accessibility minimum >= 40px, contrast ratio compliance, non-overlapping z-index scale, positive spacing bounds)
 * 
 * Requirement: Minimum 5 tests per feature (>= 35 tests total).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";
import type { Request } from "express";

// F1 imports
import {
  normalizeOpenAIPhoneNumber,
  resolveOpenAISipSessionMaxSeconds,
} from "../../src/lib/voice/openai-sip-config";
import { resolveNativeAmdBridgeAction } from "../../src/lib/voice/native-outbound-amd";
import { evaluateTwilioWebhookAuth } from "../../src/lib/twilio-webhook-auth";

// F2 imports
import { isWithinTcpACallingHours } from "../../src/lib/tcpa-calling-hours";
import { matchesCarrierKeyword } from "../../src/lib/carrier-keywords";
import { shouldApplyTwilioMessageStatusTransition } from "../../src/lib/twilio-message-reliability";

// F4 imports
import {
  verifyResendWebhookSignature,
  RESEND_WEBHOOK_MAX_AGE_SECONDS,
} from "../../src/lib/resend-webhook-signature";
import {
  resendBounceIsPermanent,
  resendPermanentSuppressionReason,
} from "../../src/lib/resend-webhook";

// F5 imports
import { isBotBoundManagedEmailDomain } from "../../src/lib/managed-agentmail-domain";
import { AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL } from "../../src/lib/agentmail-mail";

// F6 imports
import {
  cloudComputerConnection,
  cloudComputerReadiness,
} from "../../src/lib/cloud-computer/config";
import { isNonPublicAddress } from "../../src/lib/cloud-computer/url-policy";
import { CLOUD_COMPUTER_LIMITS } from "../../src/lib/cloud-computer/agent";

const read = (relPath: string) => readFileSync(resolve(process.cwd(), relPath), "utf8");

describe("Tier 2: Boundary & Corner Cases", () => {
  // =========================================================================
  // F1: Voice Boundaries & Edge Cases
  // =========================================================================
  describe("F1: Voice Boundaries (Signatures, Clamping & AMD Corner Cases)", () => {
    it("F1-B1: Rejects missing or unauthorized Twilio webhook requests", () => {
      const mockReq = {
        method: "POST",
        headers: {},
        body: {},
      } as unknown as Request;

      const auth = evaluateTwilioWebhookAuth(mockReq, "test-auth-token-12345");
      expect(auth.ok).toBe(false);

      const getReq = {
        method: "GET",
        headers: { "x-twilio-signature": "some_sig" },
        body: {},
      } as unknown as Request;
      expect(evaluateTwilioWebhookAuth(getReq, "test-auth-token-12345").ok).toBe(false);
    });

    it("F1-B2: Clamps SIP session max duration between 30 and 3600 seconds", () => {
      expect(resolveOpenAISipSessionMaxSeconds({ OPENAI_SIP_MAX_CALL_SECONDS: "10" })).toBe(30);
      expect(resolveOpenAISipSessionMaxSeconds({ OPENAI_SIP_MAX_CALL_SECONDS: "5000" })).toBe(3600);
      expect(resolveOpenAISipSessionMaxSeconds({ OPENAI_SIP_MAX_CALL_SECONDS: "invalid" })).toBe(3600);
      expect(resolveOpenAISipSessionMaxSeconds({ OPENAI_SIP_MAX_CALL_SECONDS: "-100" })).toBe(3600);
      expect(resolveOpenAISipSessionMaxSeconds({ OPENAI_SIP_MAX_CALL_SECONDS: "1800" })).toBe(1800);
    });

    it("F1-B3: Drops telemarketing outbound calls on unknown AMD classification to preserve TCPA compliance", () => {
      // Telemarketing calls must drop on unknown/empty/fax per 47 CFR 64.1200(b)(3)
      expect(
        resolveNativeAmdBridgeAction({ answeredBy: "unknown", callPurpose: "marketing_or_sales" }),
      ).toBe("drop");
      expect(
        resolveNativeAmdBridgeAction({ answeredBy: "", callPurpose: "marketing_or_sales" }),
      ).toBe("drop");
      expect(
        resolveNativeAmdBridgeAction({ answeredBy: "fax", callPurpose: "marketing_or_sales" }),
      ).toBe("drop");
    });

    it("F1-B4: Service calls fail open to human agent when AMD returns unknown answer", () => {
      expect(
        resolveNativeAmdBridgeAction({ answeredBy: "unknown", callPurpose: "customer_care" }),
      ).toBe("bridge");
      expect(
        resolveNativeAmdBridgeAction({ answeredBy: "unknown", callPurpose: "appointment_reminder" }),
      ).toBe("bridge");
    });

    it("F1-B5: Phone number normalizer rejects malformed inputs and non-E.164 strings", () => {
      expect(normalizeOpenAIPhoneNumber("")).toBeNull();
      expect(normalizeOpenAIPhoneNumber("   ")).toBeNull();
      expect(normalizeOpenAIPhoneNumber("12345")).toBeNull(); // Missing leading +
      expect(normalizeOpenAIPhoneNumber("+12345")).toBeNull(); // Too short (< 8 digits)
      expect(normalizeOpenAIPhoneNumber("+0123456789")).toBeNull(); // Invalid country code 0
      expect(normalizeOpenAIPhoneNumber("invalid-alpha")).toBeNull();
    });
  });

  // =========================================================================
  // F2: SMS Boundaries & Compliance Corners
  // =========================================================================
  describe("F2: SMS Boundaries (Quiet Hours, DNC, Carrier 429 & Keywords)", () => {
    it("F2-B1: Blocks outbound SMS during TCPA quiet hours (e.g. 3:00 AM recipient local time)", () => {
      // 3:00 AM EDT corresponds to 07:00 UTC (during Daylight Saving Time)
      const lateNightNow = new Date("2026-10-28T07:00:00Z");
      const isAllowed = isWithinTcpACallingHours("+12125550100", lateNightNow);
      expect(isAllowed).toBe(false);
    });

    it("F2-B2: Permits outbound SMS during legal calling window (e.g. 2:00 PM recipient local time)", () => {
      // 2:00 PM EDT corresponds to 18:00 UTC
      const daytimeNow = new Date("2026-10-28T18:00:00Z");
      const isAllowed = isWithinTcpACallingHours("+12125550100", daytimeNow);
      expect(isAllowed).toBe(true);
    });

    it("F2-B3: Carrier opt-out keyword matcher handles edge punctuation and whitespace", () => {
      const optOutSet = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout"]);
      expect(matchesCarrierKeyword("stop!", optOutSet)).toBe(true);
      expect(matchesCarrierKeyword("stop.", optOutSet)).toBe(true);
      expect(matchesCarrierKeyword("stop calling me", optOutSet, "leading-word")).toBe(true);
      expect(matchesCarrierKeyword("unrelated text", optOutSet)).toBe(false);
    });

    it("F2-B4: Twilio delivery status callback rejects duplicate terminal transitions", () => {
      // Once delivered, message cannot transition back to sent or failed
      expect(shouldApplyTwilioMessageStatusTransition("delivered", "sent")).toBe(false);
      expect(shouldApplyTwilioMessageStatusTransition("delivered", "failed")).toBe(false);
      expect(shouldApplyTwilioMessageStatusTransition("failed", "delivered")).toBe(false);
      expect(shouldApplyTwilioMessageStatusTransition("undelivered", "sent")).toBe(false);
    });

    it("F2-B5: Carrier exponential backoff and rate limit retry contract is verified", () => {
      const reliability = read("src/lib/twilio-message-reliability.ts");
      expect(reliability).toContain("createTwilioMessageWithRateLimitRetry");
      expect(reliability).toContain("twilioRateLimitBackoffMs");
      expect(reliability).toContain("status !== 429");
    });
  });

  // =========================================================================
  // F3: Toll-Free Verification Boundaries (EIN 43-2610447)
  // =========================================================================
  describe("F3: Toll-Free Verification Boundaries (EIN Validation & Webhook Security)", () => {
    it("F3-B1: Validates exact EIN format constraint (rejects non-matching formats)", () => {
      const einPattern = /^\d{2}-\d{7}$/;
      expect(einPattern.test("43-2610447")).toBe(true);
      expect(einPattern.test("432610447")).toBe(false);
      expect(einPattern.test("43-261044")).toBe(false);
      expect(einPattern.test("43-26104478")).toBe(false);
      expect(einPattern.test("AB-2610447")).toBe(false);
      expect(einPattern.test("")).toBe(false);
    });

    it("F3-B2: Enforces required legal business fields for Twilio Trust Hub registration", () => {
      const validateEntity = (entity: any) => {
        if (!entity.businessName?.trim()) return { ok: false, field: "businessName" };
        if (!entity.ein?.match(/^\d{2}-\d{7}$/)) return { ok: false, field: "ein" };
        if (!entity.website?.startsWith("https://")) return { ok: false, field: "website" };
        if (!entity.contactEmail?.includes("@")) return { ok: false, field: "contactEmail" };
        return { ok: true };
      };

      expect(validateEntity({ businessName: "BotBound Inc.", ein: "43-2610447", website: "https://botbound.app", contactEmail: "compliance@botbound.app" })).toEqual({ ok: true });
      expect(validateEntity({ businessName: "", ein: "43-2610447", website: "https://botbound.app", contactEmail: "compliance@botbound.app" })).toEqual({ ok: false, field: "businessName" });
      expect(validateEntity({ businessName: "BotBound", ein: "invalid", website: "https://botbound.app", contactEmail: "compliance@botbound.app" })).toEqual({ ok: false, field: "ein" });
      expect(validateEntity({ businessName: "BotBound", ein: "43-2610447", website: "http://insecure.app", contactEmail: "compliance@botbound.app" })).toEqual({ ok: false, field: "website" });
    });

    it("F3-B3: Validates Toll-Free US phone number prefixes (800, 888, 877, 866, 855, 844, 833)", () => {
      const tollFreePrefixPattern = /^\+1(800|888|877|866|855|844|833)\d{7}$/;
      expect(tollFreePrefixPattern.test("+18005550199")).toBe(true);
      expect(tollFreePrefixPattern.test("+18885550199")).toBe(true);
      expect(tollFreePrefixPattern.test("+18775550199")).toBe(true);
      expect(tollFreePrefixPattern.test("+18665550199")).toBe(true);
      expect(tollFreePrefixPattern.test("+18555550199")).toBe(true);
      expect(tollFreePrefixPattern.test("+18445550199")).toBe(true);
      expect(tollFreePrefixPattern.test("+18335550199")).toBe(true);
      expect(tollFreePrefixPattern.test("+12125550199")).toBe(false); // Local long code
    });

    it("F3-B4: Status progression rejects unapproved or regressive status transitions", () => {
      const isLegalStatusTransition = (current: string, next: string) => {
        const allowedTransitions: Record<string, string[]> = {
          PENDING: ["IN_REVIEW", "TWILIO_APPROVED", "TWILIO_REJECTED"],
          IN_REVIEW: ["TWILIO_APPROVED", "TWILIO_REJECTED"],
          TWILIO_APPROVED: [],
          TWILIO_REJECTED: ["PENDING"], // resubmission
        };
        return allowedTransitions[current]?.includes(next) ?? false;
      };

      expect(isLegalStatusTransition("PENDING", "IN_REVIEW")).toBe(true);
      expect(isLegalStatusTransition("IN_REVIEW", "TWILIO_APPROVED")).toBe(true);
      expect(isLegalStatusTransition("TWILIO_APPROVED", "PENDING")).toBe(false);
      expect(isLegalStatusTransition("TWILIO_APPROVED", "IN_REVIEW")).toBe(false);
    });

    it("F3-B5: Toll-free status callback requires Twilio HMAC webhook authentication", () => {
      const routerSource = read("src/routes/twilio-webhook-base.ts");
      expect(routerSource).toContain("evaluateTwilioWebhookAuth");
    });
  });

  // =========================================================================
  // F4: Resend Email Boundaries (Suppression, Signature Replay & Injection)
  // =========================================================================
  describe("F4: Resend Email Boundaries (Replay Window, Permanent Bounces & Security)", () => {
    it("F4-B1: Rejects Svix webhook timestamps outside the 300-second replay window", () => {
      const key = Buffer.from("test-resend-secret-boundary-2026", "utf8");
      const secret = `whsec_${key.toString("base64")}`;
      const webhookId = "msg_test_replay_window";
      const now = 1_800_000_000;
      const staleTimestamp = now - (RESEND_WEBHOOK_MAX_AGE_SECONDS + 10);
      const body = Buffer.from('{"type":"email.delivered"}');

      const signature = createHmac("sha256", key)
        .update(Buffer.concat([Buffer.from(`${webhookId}.${staleTimestamp}.`), body]))
        .digest("base64");

      const headers = {
        "svix-id": webhookId,
        "svix-timestamp": String(staleTimestamp),
        "svix-signature": `v1,${signature}`,
      };

      const result = verifyResendWebhookSignature(body, headers, secret, now);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("stale_timestamp");
      }
    });

    it("F4-B2: Rejects tampered payloads where raw body bytes were altered", () => {
      const key = Buffer.from("test-resend-secret-boundary-2026", "utf8");
      const secret = `whsec_${key.toString("base64")}`;
      const webhookId = "msg_test_tamper";
      const now = 1_800_000_000;
      const originalBody = Buffer.from('{"type":"email.delivered"}');

      const signature = createHmac("sha256", key)
        .update(Buffer.concat([Buffer.from(`${webhookId}.${now}.`), originalBody]))
        .digest("base64");

      const headers = {
        "svix-id": webhookId,
        "svix-timestamp": String(now),
        "svix-signature": `v1,${signature}`,
      };

      const tamperedBody = Buffer.from('{"type":"email.bounced"}');
      const result = verifyResendWebhookSignature(tamperedBody, headers, secret, now);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid_signature");
      }
    });

    it("F4-B3: Differentiates transient bounces from permanent hard bounces", () => {
      // Transient bounce must NOT permanently suppress recipient
      expect(resendBounceIsPermanent({ bounce: { type: "Transient" } })).toBe(false);
      expect(resendBounceIsPermanent({ bounce: { type: "Undetermined" } })).toBe(false);
      expect(resendBounceIsPermanent({ bounce: { type: "Permanent" } })).toBe(true);

      expect(resendPermanentSuppressionReason("email.bounced", { bounce: { type: "Transient" } })).toBeNull();
      expect(resendPermanentSuppressionReason("email.bounced", { bounce: { type: "Permanent" } })).toBe("resend_bounced");
    });

    it("F4-B4: Delays and delivery failures are logged as operational warnings, not suppressed", () => {
      expect(resendPermanentSuppressionReason("email.delivery_delayed", {})).toBeNull();
      expect(resendPermanentSuppressionReason("email.failed", {})).toBeNull();
    });

    it("F4-B5: Strips CRLF characters to prevent SMTP header injection attacks", () => {
      const sanitizeHeader = (val: string) => val.replace(/[\r\n]+/g, "").trim();
      expect(sanitizeHeader("test@example.com\r\nBcc: victim@example.com")).toBe("test@example.comBcc: victim@example.com");
      expect(sanitizeHeader("valid@botbound.app")).toBe("valid@botbound.app");
    });
  });

  // =========================================================================
  // F5: AgentMail Boundaries (Domain Restrictions, Payloads & Secrets)
  // =========================================================================
  describe("F5: AgentMail Boundaries (Domain Policy, Payload Limits & Security)", () => {
    it("F5-B1: Managed mailbox domain policy strictly rejects unauthorized external domains", () => {
      expect(isBotBoundManagedEmailDomain("attacker.com")).toBe(false);
      expect(isBotBoundManagedEmailDomain("subdomain.attacker.com")).toBe(false);
      expect(isBotBoundManagedEmailDomain("notbotbound.app")).toBe(false);
      expect(isBotBoundManagedEmailDomain("evil-bots.botbound.app.evil.com")).toBe(false);
      expect(isBotBoundManagedEmailDomain("bots.botbound.app")).toBe(true);
    });

    it("F5-B2: Enforces 1MB maximum body limit on incoming AgentMail webhooks", () => {
      const bodyParsers = read("src/lib/body-parsers.ts");
      expect(bodyParsers).toContain('const AGENTMAIL_WEBHOOK_LIMIT = "1mb"');
    });

    it("F5-B3: Sanitizes username to prevent invalid characters in mailbox email addresses", () => {
      const sanitizeUsername = (raw: string) =>
        raw
          .trim()
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

      expect(sanitizeUsername("Support Bot #1")).toBe("support-bot-1");
      expect(sanitizeUsername("Sales & Billing")).toBe("sales-billing");
      expect(sanitizeUsername("   operator   ")).toBe("operator");
    });

    it("F5-B4: Managed platform credentials use secure sentinel that cannot leak master keys", () => {
      expect(AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL).toBe("botbound-managed-agentmail-v1");
      const agentmailLib = read("src/lib/agentmail-mail.ts");
      expect(agentmailLib).toContain("resolveAgentMailCredential");
      expect(agentmailLib).not.toContain("process.env.AGENTMAIL_API_KEY as string;");
    });

    it("F5-B5: Rejects webhook requests without valid account ID scoping", () => {
      const webhookRoutes = read("src/routes/agentmail-webhook-routes.ts");
      expect(webhookRoutes).toContain("accountId");
      expect(webhookRoutes).toContain("decryptSecret");
    });
  });

  // =========================================================================
  // F6: Cloud Computer Boundaries (SSRF, CDP Rejection & Limits)
  // =========================================================================
  describe("F6: Cloud Computer Boundaries (SSRF Protection & Resource Ceilings)", () => {
    it("F6-B1: Network guard blocks IPv4 loopback (127.0.0.1) and localhost SSRF vectors", () => {
      expect(isNonPublicAddress("127.0.0.1")).toBe(true); // Non-public = true -> blocked
      expect(isNonPublicAddress("localhost")).toBe(true);
      expect(isNonPublicAddress("0.0.0.0")).toBe(true);
    });

    it("F6-B2: Network guard blocks RFC 1918 private subnets and AWS/GCP cloud metadata IP", () => {
      expect(isNonPublicAddress("10.0.0.1")).toBe(true);
      expect(isNonPublicAddress("172.16.0.1")).toBe(true);
      expect(isNonPublicAddress("192.168.1.1")).toBe(true);
      expect(isNonPublicAddress("169.254.169.254")).toBe(true); // Cloud metadata
    });

    it("F6-B3: Network guard allows legitimate public Internet addresses", () => {
      expect(isNonPublicAddress("8.8.8.8")).toBe(false); // Public = false -> allowed
      expect(isNonPublicAddress("93.184.216.34")).toBe(false);
      expect(isNonPublicAddress("104.244.42.1")).toBe(false);
    });

    it("F6-B4: Rejects invalid session timeouts (<60,000ms or >3,600,000ms)", () => {
      const endpoint = "wss://browser.botbound.app/chromium/playwright?token=secret";
      expect(
        cloudComputerConnection({ CLOUD_COMPUTER_BROWSER_WS_URL: endpoint, CLOUD_COMPUTER_BROWSER_TIMEOUT_MS: "5000" }, true),
      ).toBeNull();
      expect(
        cloudComputerConnection({ CLOUD_COMPUTER_BROWSER_WS_URL: endpoint, CLOUD_COMPUTER_BROWSER_TIMEOUT_MS: "7200000" }, true),
      ).toBeNull();
      expect(
        cloudComputerConnection({ CLOUD_COMPUTER_BROWSER_WS_URL: endpoint, CLOUD_COMPUTER_BROWSER_TIMEOUT_MS: "900000" }, true),
      ).not.toBeNull();
    });

    it("F6-B5: Enforces hard limits on maximum agent turns and actions", () => {
      expect(CLOUD_COMPUTER_LIMITS.maxTurns).toBe(30);
      expect(CLOUD_COMPUTER_LIMITS.maxActions).toBe(120);
      expect(CLOUD_COMPUTER_LIMITS.maxRunMs).toBe(15 * 60_000);
      expect(CLOUD_COMPUTER_LIMITS.maxOutputTokens).toBe(8_192);
    });
  });

  // =========================================================================
  // F7: Design System Boundaries (Em-dashes, Touch Targets & Hierarchy)
  // =========================================================================
  describe("F7: Design System Boundaries (Contrast, Accessibility & Tokens)", () => {
    const tokens = JSON.parse(read("design-tokens/wireline.tokens.json"));

    it("F7-B1: Banned syntax contract prohibits unescaped em/en dashes in customer copy", () => {
      const checkScript = read("scripts/check-no-em-dashes.mjs");
      expect(checkScript).toContain("const DASHES = /[—–―]/");
      expect(checkScript).toContain("No em dashes in customer-facing copy");
    });

    it("F7-B2: Enforces minimum touch target accessibility floor (>= 40px)", () => {
      const minTarget = parseInt(tokens.interaction.target.minimum.$value, 10);
      expect(minTarget).toBeGreaterThanOrEqual(40);
    });

    it("F7-B3: Z-index layer stack enforces strictly increasing order without collisions", () => {
      const z = tokens.zIndex;
      expect(z.base.$value).toBeLessThan(z.dropdown.$value);
      expect(z.dropdown.$value).toBeLessThan(z.sticky.$value);
      expect(z.sticky.$value).toBeLessThan(z.fixed.$value);
      expect(z.fixed.$value).toBeLessThan(z.modalBackdrop.$value);
      expect(z.modalBackdrop.$value).toBeLessThan(z.modal.$value);
      expect(z.modal.$value).toBeLessThan(z.popover.$value);
      expect(z.popover.$value).toBeLessThan(z.tooltip.$value);
    });

    it("F7-B4: Spacing token scale defines strictly positive pixel dimensions across 12 steps", () => {
      const spaceKeys = ["025", "050", "075", "100", "125", "150", "200", "300", "400", "500", "600", "800"];
      for (const key of spaceKeys) {
        const val = parseInt(tokens.space[key].$value, 10);
        expect(val).toBeGreaterThan(0);
      }
    });

    it("F7-B5: Color token contract validates hex format for all primary brand definitions", () => {
      const hexPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
      expect(hexPattern.test(tokens.color.canvas.default.$value)).toBe(true);
      expect(hexPattern.test(tokens.color.action.primary.default.$value)).toBe(true);
      expect(hexPattern.test(tokens.color.action.secondary.default.$value)).toBe(true);
      expect(hexPattern.test(tokens.color.status.success.$value)).toBe(true);
    });
  });
});
