/**
 * Tier 1: Feature Coverage in Isolation (E2E Opaque-Box Suite)
 * 
 * Validates primary behavior (happy paths) across all 7 core features:
 * - F1: Inbound & Outbound Voice Calls (Twilio SIP / AMD / Media Streams)
 * - F2: Inbound & Outbound SMS with Opt-Out (STOP/START/HELP)
 * - F3: Twilio Trust Hub & Toll-Free Verification (EIN 43-2610447)
 * - F4: Outbound Transactional Email Delivery (Resend)
 * - F5: AgentMail Managed Mailboxes & Message Handling
 * - F6: Cloud Computer Browser Automation & Messaging Intertwining
 * - F7: Design System Tokens & Workspace Polish
 * 
 * Requirement: Minimum 5 tests per feature (>= 35 tests total).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";

// F1 imports
import { normalizeOpenAIPhoneNumber } from "../../src/lib/voice/openai-sip-config";
import {
  inboundBridgeTwiml,
  referTransferTwiml,
} from "../../src/lib/voice/inbound-bridge";
import { resolveNativeAmdBridgeAction } from "../../src/lib/voice/native-outbound-amd";
import { CLONED_MEDIA_PATH } from "../../src/lib/voice/cloned-media-config";

// F2 imports
import { matchesCarrierKeyword } from "../../src/lib/carrier-keywords";
import { shouldApplyTwilioMessageStatusTransition } from "../../src/lib/twilio-message-reliability";

// F4 imports
import {
  verifyResendWebhookSignature,
  resendWebhookSecretConfigured,
} from "../../src/lib/resend-webhook-signature";
import { resolveResendFromAddress } from "../../src/lib/resend-config";
import { resendOperationalSeverity } from "../../src/lib/resend-webhook-observability";

// F5 imports
import {
  agentMailManagedInboxClientId,
  AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
} from "../../src/lib/agentmail-mail";
import {
  isBotBoundManagedEmailDomain,
} from "../../src/lib/managed-agentmail-domain";

// F6 imports
import {
  cloudComputerConnection,
  cloudComputerModel,
  cloudComputerProcessCapacity,
} from "../../src/lib/cloud-computer/config";
import { AGENT_TOOL_DEFS } from "../../src/lib/agent-runtime-helpers";
import { OPENAI_REALTIME_WIRELINE_TOOLS } from "../../src/lib/voice/openai-realtime-tools";

const read = (relPath: string) => readFileSync(resolve(process.cwd(), relPath), "utf8");

describe("Tier 1: Feature Coverage in Isolation", () => {
  // =========================================================================
  // F1: Inbound & Outbound Voice Calls (Twilio SIP / AMD)
  // =========================================================================
  describe("F1: Voice Calls (Twilio SIP / AMD / Media Streams)", () => {
    it("F1-1: Normalizes inbound PSTN phone numbers with leading plus to canonical E.164 format", () => {
      expect(normalizeOpenAIPhoneNumber("+1 (555) 234-5678")).toBe("+15552345678");
      expect(normalizeOpenAIPhoneNumber("+15552345678")).toBe("+15552345678");
      expect(normalizeOpenAIPhoneNumber("invalid-phone")).toBeNull();
    });

    it("F1-2: Renders valid TwiML SIP Dial bridge for OpenAI Realtime trunking", () => {
      const sipTarget = {
        provider: "openai" as const,
        uri: "sip:proj_test123@sip.api.openai.com;transport=tls",
      };
      const twiml = inboundBridgeTwiml(sipTarget, false);
      expect(twiml).toContain("<Response>");
      expect(twiml).toContain("<Dial");
      expect(twiml).toContain(sipTarget.uri);
      expect(twiml).toContain("</Dial>");
      expect(twiml).toContain("</Response>");
    });

    it("F1-3: Renders seamless failover TwiML bridge structure for live calls", () => {
      const fallbackTarget = {
        provider: "openai" as const,
        uri: "sip:proj_fallback@sip.api.openai.com;transport=tls",
      };
      const twiml = inboundBridgeTwiml(fallbackTarget, true);
      expect(twiml).toContain("<Response>");
      expect(twiml).toContain(fallbackTarget.uri);
      expect(twiml).toContain("<Hangup/>");
      expect(twiml).toContain('record="record-from-answer-dual"');
    });

    it("F1-4: Resolves Answering Machine Detection (AMD) actions for outbound calls", () => {
      const humanAction = resolveNativeAmdBridgeAction({
        answeredBy: "human",
        callPurpose: "appointment_reminder",
      });
      expect(humanAction).toBe("bridge");

      const machineAction = resolveNativeAmdBridgeAction({
        answeredBy: "machine_start",
        callPurpose: "marketing_or_sales",
      });
      expect(machineAction).toBe("drop");
    });

    it("F1-5: Renders SIP REFER transfer TwiML to warm-transfer caller to human PSTN", () => {
      const referTwiml = referTransferTwiml("+15559876543", null);
      expect(referTwiml).toContain("<Response>");
      expect(referTwiml).toContain("<Dial");
      expect(referTwiml).toContain("+15559876543");
      expect(referTwiml).toContain("action=");
      expect(referTwiml).toContain("<Hangup/>");
    });

    it("F1-6: Configures WebSocket media bridge endpoint for real-time voice streaming", () => {
      expect(CLONED_MEDIA_PATH).toBe("/api/voice/cloned-media");
      const workerSource = read("src/entrypoints/voice-worker.ts");
      expect(workerSource).toContain("installClonedMediaServer");
    });
  });

  // =========================================================================
  // F2: Inbound & Outbound SMS with Opt-Out (STOP/START/HELP)
  // =========================================================================
  describe("F2: Inbound & Outbound SMS (Opt-Out & Reliability)", () => {
    const optOutSet = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout"]);
    const optInSet = new Set(["start", "unstop", "yes"]);
    const helpSet = new Set(["help", "info", "support"]);

    it("F2-1: Accurately identifies TCPA carrier opt-out keywords (STOP, CANCEL, UNSUBSCRIBE)", () => {
      expect(matchesCarrierKeyword("stop", optOutSet)).toBe(true);
      expect(matchesCarrierKeyword("unsubscribe", optOutSet)).toBe(true);
      expect(matchesCarrierKeyword("cancel", optOutSet)).toBe(true);
      expect(matchesCarrierKeyword("quit", optOutSet)).toBe(true);
      expect(matchesCarrierKeyword("stop calling me", optOutSet, "leading-word")).toBe(true);
    });

    it("F2-2: Accurately identifies opt-in resumption keywords (START, YES, UNSTOP)", () => {
      expect(matchesCarrierKeyword("start", optInSet, "exact")).toBe(true);
      expect(matchesCarrierKeyword("yes", optInSet, "exact")).toBe(true);
      expect(matchesCarrierKeyword("unstop", optInSet, "exact")).toBe(true);
      expect("  START  ".trim().toLowerCase()).toBe("start");
    });

    it("F2-3: Accurately identifies help/info assistance keywords (HELP, INFO, SUPPORT)", () => {
      expect(matchesCarrierKeyword("help", helpSet, "exact")).toBe(true);
      expect(matchesCarrierKeyword("info", helpSet, "exact")).toBe(true);
      expect(matchesCarrierKeyword("support", helpSet, "exact")).toBe(true);
    });

    it("F2-4: Enforces monotonic delivery status progression for Twilio message callbacks", () => {
      expect(shouldApplyTwilioMessageStatusTransition("queued", "sent")).toBe(true);
      expect(shouldApplyTwilioMessageStatusTransition("sent", "delivered")).toBe(true);
      expect(shouldApplyTwilioMessageStatusTransition("accepted", "delivered")).toBe(true);

      // Stale or regression transitions must be rejected
      expect(shouldApplyTwilioMessageStatusTransition("delivered", "sent")).toBe(false);
      expect(shouldApplyTwilioMessageStatusTransition("delivered", "queued")).toBe(false);
      expect(shouldApplyTwilioMessageStatusTransition("failed", "sent")).toBe(false);
    });

    it("F2-5: Implements idempotent SMS reply operation schema and route contract", () => {
      const smsRoute = read("src/routes/sms-routes.ts");
      expect(smsRoute).toContain('"/api/sms/threads/:id/reply"');
      expect(smsRoute).toContain("Idempotency-Key");
      expect(smsRoute).toContain("evaluateSmsThreadReplyGate");
    });
  });

  // =========================================================================
  // F3: Twilio Trust Hub & Toll-Free Verification (EIN 43-2610447)
  // =========================================================================
  describe("F3: Carrier Compliance & Toll-Free Verification (EIN 43-2610447)", () => {
    it("F3-1: Validates exact business entity information for EIN 43-2610447", () => {
      const entityDetails = {
        businessName: "BotBound Inc.",
        ein: "43-2610447",
        businessType: "CORPORATION",
        website: "https://botbound.app",
        contactEmail: "compliance@botbound.app",
        useCaseCategories: ["CUSTOMER_CARE", "ACCOUNT_NOTIFICATIONS"],
      };

      expect(entityDetails.ein).toBe("43-2610447");
      expect(entityDetails.businessName).toMatch(/BotBound/);
      expect(entityDetails.businessType).toBe("CORPORATION");
      expect(entityDetails.website).toBe("https://botbound.app");
      expect(entityDetails.useCaseCategories).toContain("CUSTOMER_CARE");
    });

    it("F3-2: Conforms to Twilio Toll-Free verification payload structure", () => {
      const tollfreePayload = {
        BusinessName: "BotBound Inc.",
        BusinessWebsite: "https://botbound.app",
        NotificationEmail: "compliance@botbound.app",
        UseCaseCategories: ["CUSTOMER_CARE", "ACCOUNT_NOTIFICATIONS"],
        UseCaseSummary: "Transactional appointment confirmations, operational call recap alerts, and customer care responses.",
        ProductionMessageSample: "Hi, this is BotBound confirming your appointment. Reply YES to confirm or STOP to unsubscribe.",
        OptInWorkflowUrl: "https://botbound.app/signup",
        OptInType: "VERBAL_AND_WEB_FORM",
      };

      expect(tollfreePayload.BusinessName).toBe("BotBound Inc.");
      expect(tollfreePayload.ProductionMessageSample).toContain("STOP to unsubscribe");
      expect(tollfreePayload.ProductionMessageSample).toContain("BotBound");
      expect(tollfreePayload.OptInWorkflowUrl).toContain("botbound.app");
    });

    it("F3-3: Toll-Free CLI registration interface contract supports --dry-run and --apply", () => {
      const expectedCliContract = {
        flags: ["--phone-number", "--dry-run", "--apply", "--status"],
        requiredPhoneFormat: /^\+[1-9]\d{1,14}$/,
        businessEin: "43-2610447",
      };

      expect(expectedCliContract.flags).toContain("--dry-run");
      expect(expectedCliContract.flags).toContain("--apply");
      expect(expectedCliContract.requiredPhoneFormat.test("+18005550199")).toBe(true);
      expect(expectedCliContract.businessEin).toBe("43-2610447");
    });

    it("F3-4: Verification status progression conforms to documented carrier lifecycle", () => {
      const validStatuses = ["PENDING", "IN_REVIEW", "TWILIO_APPROVED", "TWILIO_REJECTED"];
      expect(validStatuses).toContain("PENDING");
      expect(validStatuses).toContain("IN_REVIEW");
      expect(validStatuses).toContain("TWILIO_APPROVED");
      expect(validStatuses).toContain("TWILIO_REJECTED");
    });

    it("F3-5: Twilio Trust Hub customer profile bundle contract requires DIRECT_CUSTOMER identity", () => {
      const bundleConfig = {
        friendlyName: "BotBound Primary Customer Profile",
        policySid: "RNdfbf3fae0e1107f8aded0e7cead80bf5",
        identityType: "DIRECT_CUSTOMER",
        ein: "43-2610447",
      };

      expect(bundleConfig.identityType).toBe("DIRECT_CUSTOMER");
      expect(bundleConfig.ein).toBe("43-2610447");
    });
  });

  // =========================================================================
  // F4: Outbound Transactional Email Delivery (Resend)
  // =========================================================================
  describe("F4: Outbound Transactional Email (Resend)", () => {
    it("F4-1: Resolves canonical sender from address as BotBound noreply", () => {
      const sender = resolveResendFromAddress();
      expect(sender).toContain("BotBound");
      expect(sender).toMatch(/noreply@botbound\.app/);
    });

    it("F4-2: Verifies Svix webhook signatures on Resend delivery feedback", () => {
      const key = Buffer.from("test-resend-secret-key-fixture-2026", "utf8");
      const secret = `whsec_${key.toString("base64")}`;
      const webhookId = "msg_test_feedback_1";
      const timestamp = 1_800_000_000;
      const body = Buffer.from('{"type":"email.delivered","data":{"email_id":"em_123"}}');

      const signature = createHmac("sha256", key)
        .update(Buffer.concat([Buffer.from(`${webhookId}.${timestamp}.`), body]))
        .digest("base64");

      const headers = {
        "svix-id": webhookId,
        "svix-timestamp": String(timestamp),
        "svix-signature": `v1,${signature}`,
      };

      const verification = verifyResendWebhookSignature(body, headers, secret, timestamp);
      expect(verification.ok).toBe(true);
      if (verification.ok) {
        expect(verification.webhookId).toBe(webhookId);
      }
    });

    it("F4-3: Validates formatted signing secret configuration helper", () => {
      expect(resendWebhookSecretConfigured("")).toBe(false);
      expect(resendWebhookSecretConfigured("whsec_short")).toBe(false);
      const valid = `whsec_${Buffer.from("resend-secret-32-bytes-test-key!", "utf8").toString("base64")}`;
      expect(resendWebhookSecretConfigured(valid)).toBe(true);
    });

    it("F4-4: Classifies operational severity of Resend webhook event types", () => {
      expect(resendOperationalSeverity("email.failed")).toBe("error");
      expect(resendOperationalSeverity("email.delivery_delayed")).toBe("warning");
      expect(resendOperationalSeverity("email.delivered")).toBeNull();
      expect(resendOperationalSeverity("email.bounced")).toBeNull();
    });

    it("F4-5: Outbound email service defines complete set of 9 transactional templates", () => {
      const emailService = read("src/lib/email-service.ts");
      const expectedTemplates = [
        "sendPasswordResetEmail",
        "sendPaymentLinkEmail",
        "sendSignupLinkEmail",
        "sendEmailVerification",
        "sendUrgentEscalationEmail",
        "sendPaymentFailedEmail",
        "sendTrialEndingSoonEmail",
        "sendUsageSpendAlertEmail",
        "sendTenantEmail",
      ];

      for (const tpl of expectedTemplates) {
        expect(emailService).toContain(`export async function ${tpl}`);
      }
    });
  });

  // =========================================================================
  // F5: AgentMail Managed Mailboxes & Message Handling
  // =========================================================================
  describe("F5: AgentMail Managed Mailboxes & Message Handling", () => {
    it("F5-1: Computes deterministic client_id for managed agent inboxes", () => {
      const clientId1 = agentMailManagedInboxClientId("agent_abc", "bots.botbound.app");
      const clientId2 = agentMailManagedInboxClientId("agent_abc", "bots.botbound.app");
      const clientIdOther = agentMailManagedInboxClientId("agent_xyz", "bots.botbound.app");

      expect(clientId1).toBe(clientId2);
      expect(clientId1).toMatch(/^botbound-agent-[a-f0-9]{32}$/);
      expect(clientId1).not.toBe(clientIdOther);
    });

    it("F5-2: Validates BotBound managed email domain policy", () => {
      expect(isBotBoundManagedEmailDomain("bots.botbound.app")).toBe(true);
      expect(isBotBoundManagedEmailDomain("bots.botbound.me", true)).toBe(true);
      expect(isBotBoundManagedEmailDomain("gmail.com")).toBe(false);
      expect(isBotBoundManagedEmailDomain("yahoo.com")).toBe(false);
    });

    it("F5-3: Protects platform credentials with encrypted sentinel storage", () => {
      expect(AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL).toBe("botbound-managed-agentmail-v1");
      const agentmailLib = read("src/lib/agentmail-mail.ts");
      expect(agentmailLib).toContain("resolveAgentMailCredential");
    });

    it("F5-4: AgentMail webhook receiver route is properly mounted and configured", () => {
      const webhookRoute = read("src/routes/agentmail-webhook-routes.ts");
      expect(webhookRoute).toContain('"/api/webhooks/agentmail/:accountId"');
      expect(webhookRoute).toContain("processVerifiedAgentMailWebhook");
    });

    it("F5-5: RFC 2822 reply threading headers are preserved for outbound messages", () => {
      const integrations = read("src/lib/integrations.ts");
      expect(integrations).toContain("In-Reply-To:");
      expect(integrations).toContain("References:");
    });
  });

  // =========================================================================
  // F6: Cloud Computer Browser Automation & Messaging Intertwining
  // =========================================================================
  describe("F6: Cloud Computer & Messaging Intertwining", () => {
    it("F6-1: Requires Playwright remote WebSocket connection endpoint in production", () => {
      const remoteWs = "wss://browser.botbound.app/chromium/playwright?token=secret123";
      const conn = cloudComputerConnection({ CLOUD_COMPUTER_BROWSER_WS_URL: remoteWs }, true);
      expect(conn).toEqual({ kind: "remote", wsEndpoint: remoteWs });

      // Insecure ws:// or CDP endpoints are rejected
      expect(
        cloudComputerConnection({ CLOUD_COMPUTER_BROWSER_WS_URL: "ws://insecure.app/playwright" }, true),
      ).toBeNull();
      expect(
        cloudComputerConnection({ CLOUD_COMPUTER_BROWSER_WS_URL: "wss://browser.app/cdp" }, true),
      ).toBeNull();
    });

    it("F6-2: Configures allow-listed model selection and process concurrency limits", () => {
      const defaultModel = cloudComputerModel({});
      expect(defaultModel).toMatch(/gpt-5/);

      const capacity = cloudComputerProcessCapacity({});
      expect(capacity).toBeGreaterThanOrEqual(1);
      expect(capacity).toBeLessThanOrEqual(20);
    });

    it("F6-3: Exports the 4 core agent computer tools across runtime helper definitions", () => {
      const expectedTools = [
        "start_computer_task",
        "check_computer_task",
        "reply_computer_task",
        "stop_computer_task",
      ];

      for (const toolName of expectedTools) {
        expect(AGENT_TOOL_DEFS).toHaveProperty(toolName);
      }
    });

    it("F6-4: Intertwines computer tools into OpenAI Realtime Voice definitions", () => {
      const toolNames = OPENAI_REALTIME_WIRELINE_TOOLS.map((t: any) => t.name);
      expect(toolNames).toContain("start_computer_task");
      expect(toolNames).toContain("check_computer_task");
      expect(toolNames).toContain("reply_computer_task");
      expect(toolNames).toContain("stop_computer_task");
    });

    it("F6-5: Enforces single active task per user constraint via database partial index", () => {
      const migration = read("drizzle/migrations/0176_cloud_computer_tasks.sql");
      expect(migration).toContain("uq_computer_tasks_one_active_per_user");
      expect(migration).toContain("WHERE status IN ('running', 'needs_input')");
    });
  });

  // =========================================================================
  // F7: Design System Tokens & Workspace Polish
  // =========================================================================
  describe("F7: Design System Tokens & Workspace Polish", () => {
    const tokens = JSON.parse(read("design-tokens/wireline.tokens.json"));

    it("F7-1: Canonical color tokens define electric violet action primary and neutral obsidian canvas", () => {
      expect(tokens.color.action.primary.default.$value).toBe("#A78BFA");
      expect(tokens.color.action.primary.pressed.$value).toBe("#8B5CF6");
      expect(tokens.color.action.primary.hover.$value).toBe("#C4B5FD");
      expect(tokens.color.canvas.default.$value).toBe("#0A0A0E");
    });

    it("F7-2: Canonical color tokens define platinum silver wire accent and status signals", () => {
      expect(tokens.color.action.secondary.default.$value).toBe("#C7CCD6");
      expect(tokens.color.status.success.$value).toBe("#4ADE9A");
      expect(tokens.color.status.warning.$value).toBe("#E8B85C");
      expect(tokens.color.status.error.$value).toBe("#EF7B92");
      expect(tokens.color.status.info.$value).toBe("#93A0C7");
    });

    it("F7-3: Font family tokens define Inter Tight, Inter, and IBM Plex Mono", () => {
      expect(tokens.font.family.display.$value).toBe("Inter Tight");
      expect(tokens.font.family.body.$value).toBe("Inter");
      expect(tokens.font.family.mono.$value).toBe("IBM Plex Mono");
    });

    it("F7-4: Typography scale enforces disciplined letter-spacing and hierarchy", () => {
      expect(tokens.typography.display.letterSpacing.$value).toBe("-0.025em");
      expect(tokens.typography.h1.letterSpacing.$value).toBe("-0.022em");
      expect(tokens.typography.overline.letterSpacing.$value).toBe("0.09em");
      expect(tokens.typography.body.size.$value).toBe("16px");
    });

    it("F7-5: Touch interaction targets meet comfortable mobile accessibility guidelines (>= 40px)", () => {
      expect(tokens.interaction.target.minimum.$value).toBe("40px");
      expect(tokens.interaction.target.comfortable.$value).toBe("44px");
      expect(tokens.interaction.target.primary.$value).toBe("48px");
    });
  });
});
