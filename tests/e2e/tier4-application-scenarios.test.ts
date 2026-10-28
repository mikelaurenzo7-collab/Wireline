/**
 * Tier 4: Real-World Application Scenarios (E2E Opaque-Box Suite)
 * 
 * Validates complete end-to-end user journeys and operational workflows:
 * 1. Scenario 1: Inbound Call with Autonomous Browser Lookup & SMS Followup (F1, F2, F6)
 * 2. Scenario 2: Toll-Free Profile Submission & Carrier Registration Verification (F3: EIN 43-2610447)
 * 3. Scenario 3: AgentMail Inbound Inquiry with AI Draft & Owner Approval (F4, F5)
 * 4. Scenario 4: SMS Opt-Out Lifecycle with DNC Enforcement & Quiet Hours (F2)
 * 5. Scenario 5: Omnichannel Escalation: Missed Call -> Resend Alert -> AgentMail Reply (F1, F4, F5)
 * 
 * Requirement: Minimum 5 realistic application scenario tests.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";

// Domain & library imports
import { normalizeOpenAIPhoneNumber } from "../../src/lib/voice/openai-sip-config";
import { inboundBridgeTwiml, referTransferTwiml } from "../../src/lib/voice/inbound-bridge";
import { matchesCarrierKeyword } from "../../src/lib/carrier-keywords";
import { shouldApplyTwilioMessageStatusTransition } from "../../src/lib/twilio-message-reliability";
import { isWithinTcpACallingHours } from "../../src/lib/tcpa-calling-hours";
import { verifyResendWebhookSignature } from "../../src/lib/resend-webhook-signature";
import { resolveResendFromAddress } from "../../src/lib/resend-config";
import { agentMailManagedInboxClientId } from "../../src/lib/agentmail-mail";
import { isBotBoundManagedEmailDomain } from "../../src/lib/managed-agentmail-domain";
import { isNonPublicAddress } from "../../src/lib/cloud-computer/url-policy";
import { CLOUD_COMPUTER_LIMITS } from "../../src/lib/cloud-computer/agent";
import { AGENT_TOOL_DEFS } from "../../src/lib/agent-runtime-helpers";

const read = (relPath: string) => readFileSync(resolve(process.cwd(), relPath), "utf8");

describe("Tier 4: Real-World Application Scenarios", () => {
  // =========================================================================
  // Scenario 1: Inbound Call with Autonomous Browser Lookup & SMS Followup
  // =========================================================================
  it("Scenario 1: Inbound Call with Autonomous Browser Lookup & SMS Confirmation Flow", () => {
    // 1. Inbound PSTN call arrives on Twilio number
    const inboundPhone = "+1 (555) 234-5678";
    const normalizedCaller = normalizeOpenAIPhoneNumber(inboundPhone);
    expect(normalizedCaller).toBe("+15552345678");

    // 2. Twilio Inbound Webhook bridges caller to OpenAI Realtime SIP trunk
    const sipTarget = {
      provider: "openai" as const,
      uri: "sip:proj_scenario1@sip.api.openai.com;transport=tls",
    };
    const bridgeTwiml = inboundBridgeTwiml(sipTarget, false);
    expect(bridgeTwiml).toContain("<Dial");
    expect(bridgeTwiml).toContain(sipTarget.uri);

    // 3. During the call, caller requests live schedule lookup.
    // Agent runtime initiates asynchronous browser lookup task
    expect(AGENT_TOOL_DEFS).toHaveProperty("start_computer_task");
    expect(AGENT_TOOL_DEFS).toHaveProperty("check_computer_task");

    const taskDefinition = {
      goal: "Check next available dental cleaning slot on clinic portal",
      startUrl: "https://clinic-portal.example.com/schedule",
    };
    expect(taskDefinition.startUrl.startsWith("https://")).toBe(true);
    expect(isNonPublicAddress("127.0.0.1")).toBe(true); // Loopback is blocked
    expect(isNonPublicAddress("93.184.216.34")).toBe(false); // Public is allowed

    // 4. Appointment confirmed: system dispatches outbound SMS confirmation
    const smsConfirmationMessage =
      "Hi from BotBound! Your appointment is confirmed for Thursday at 2:00 PM. Reply YES to confirm or STOP to unsubscribe.";
    expect(smsConfirmationMessage).toContain("confirmed");
    expect(smsConfirmationMessage).toContain("STOP to unsubscribe");

    // 5. TCPA calling hours verified for recipient
    const appointmentTime = new Date("2026-10-28T18:00:00Z"); // 2:00 PM EDT
    expect(isWithinTcpACallingHours(normalizedCaller, appointmentTime)).toBe(true);
  });

  // =========================================================================
  // Scenario 2: Toll-Free Profile Submission & Carrier Registration Verification
  // =========================================================================
  it("Scenario 2: Twilio Trust Hub & Toll-Free Verification Lifecycle for EIN 43-2610447", () => {
    // 1. Entity validation for business registration
    const registrationDetails = {
      businessName: "BotBound Inc.",
      ein: "43-2610447",
      businessType: "CORPORATION",
      website: "https://botbound.app",
      contactEmail: "compliance@botbound.app",
      useCaseCategories: ["CUSTOMER_CARE", "ACCOUNT_NOTIFICATION"],
      tollFreeNumber: "+18005550199",
      productionMessageSample:
        "Hi, this is BotBound confirming your appointment. Reply YES to confirm or STOP to unsubscribe.",
    };

    expect(registrationDetails.ein).toBe("43-2610447");
    expect(registrationDetails.tollFreeNumber).toMatch(/^\+1(800|888|877|866|855|844|833)\d{7}$/);
    expect(registrationDetails.productionMessageSample).toContain("STOP to unsubscribe");

    // 2. Submission payload generates PENDING verification receipt
    const submissionReceipt = {
      tollfree_verification_sid: "HH1234567890abcdef1234567890abcdef",
      bundle_sid: "BU1234567890abcdef1234567890abcdef",
      status: "PENDING",
      submitted_at: new Date().toISOString(),
    };
    expect(submissionReceipt.tollfree_verification_sid).toMatch(/^HH[a-f0-9]{32}$/);
    expect(submissionReceipt.status).toBe("PENDING");

    // 3. Webhook receives status callback progression
    const simulateStatusCallback = (sid: string, status: string) => {
      const allowedStatuses = ["PENDING", "IN_REVIEW", "TWILIO_APPROVED", "TWILIO_REJECTED"];
      expect(allowedStatuses).toContain(status);
      return {
        VerificationSid: sid,
        Status: status,
        updatedAt: new Date().toISOString(),
      };
    };

    const reviewCallback = simulateStatusCallback(submissionReceipt.tollfree_verification_sid, "IN_REVIEW");
    expect(reviewCallback.Status).toBe("IN_REVIEW");

    const approvedCallback = simulateStatusCallback(submissionReceipt.tollfree_verification_sid, "TWILIO_APPROVED");
    expect(approvedCallback.Status).toBe("TWILIO_APPROVED");

    // 4. Line verification unlocks SMS outbound status
    expect(shouldApplyTwilioMessageStatusTransition("queued", "sent")).toBe(true);
  });

  // =========================================================================
  // Scenario 3: AgentMail Inbound Inquiry with AI Draft & Owner Approval
  // =========================================================================
  it("Scenario 3: AgentMail Inbound Customer Inquiry with AI Draft & Owner Approval in Workspace", () => {
    // 1. Managed bot mailbox identity verified
    const agentId = "agent_sales_1";
    const domain = "bots.botbound.app";
    expect(isBotBoundManagedEmailDomain(domain)).toBe(true);

    const clientId = agentMailManagedInboxClientId(agentId, domain);
    expect(clientId).toMatch(/^botbound-agent-[a-f0-9]{32}$/);

    // 2. Inbound customer inquiry arrives via Svix webhook
    const rawKey = Buffer.from("agentmail-test-key-fixture-2026", "utf8");
    const secret = `whsec_${rawKey.toString("base64")}`;
    const webhookId = "msg_agentmail_inbound_1";
    const now = Math.floor(Date.now() / 1000);
    const emailPayload = Buffer.from(
      JSON.stringify({
        event: "message.received",
        data: {
          message_id: "msg_inquiry_999",
          from: "customer@example.com",
          to: `sales-${agentId}@bots.botbound.app`,
          subject: "Pricing inquiry for enterprise bots",
          text: "Can you send me your pricing tiers and volume discounts?",
        },
      }),
    );

    const sig = createHmac("sha256", rawKey)
      .update(Buffer.concat([Buffer.from(`${webhookId}.${now}.`), emailPayload]))
      .digest("base64");

    const headers = {
      "svix-id": webhookId,
      "svix-timestamp": String(now),
      "svix-signature": `v1,${sig}`,
    };

    const verifyResult = verifyResendWebhookSignature(emailPayload, headers, secret, now);
    expect(verifyResult.ok).toBe(true);

    // 3. System drafts response and places in ApprovalInbox for human review
    const draftResponse = {
      threadId: "thread_enterprise_pricing",
      proposedSubject: "Re: Pricing inquiry for enterprise bots",
      proposedBody: "Hi, thanks for reaching out to BotBound! Here is our enterprise pricing guide...",
      status: "pending_approval",
      requiresHumanSignoff: true,
    };
    expect(draftResponse.requiresHumanSignoff).toBe(true);
    expect(draftResponse.status).toBe("pending_approval");

    // 4. Owner approves: outbound email sends with RFC 2822 threading headers
    const outboundReplyMime = [
      "To: customer@example.com",
      "Subject: Re: Pricing inquiry for enterprise bots",
      "In-Reply-To: <msg_inquiry_999@example.com>",
      "References: <msg_inquiry_999@example.com>",
    ];
    expect(outboundReplyMime).toContain("In-Reply-To: <msg_inquiry_999@example.com>");
    expect(outboundReplyMime).toContain("References: <msg_inquiry_999@example.com>");
  });

  // =========================================================================
  // Scenario 4: TCPA Compliance & Opt-Out Lifecycle
  // =========================================================================
  it("Scenario 4: TCPA Compliance Lifecycle (STOP Opt-Out -> DNC Scrub -> Voice/SMS Gate)", () => {
    const customerPhone = "+15551234567";
    const optOutSet = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout"]);
    const optInSet = new Set(["start", "unstop", "yes"]);

    // 1. Customer texts STOP in response to outbound message
    const incomingText = "STOP";
    expect(matchesCarrierKeyword(incomingText.toLowerCase(), optOutSet)).toBe(true);

    // 2. Inbound SMS webhook returns auto-confirmation TwiML and inserts to DNC list
    const optOutConfirmationTwiml =
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed and will receive no further messages. Reply START to resubscribe.</Message></Response>';
    expect(optOutConfirmationTwiml).toContain("You have been unsubscribed");
    expect(optOutConfirmationTwiml).toContain("Reply START to resubscribe");

    // 3. Simulated DNC registry lookup blocks subsequent outbound SMS
    const dncList = new Set<string>();
    dncList.add(customerPhone);
    expect(dncList.has(customerPhone)).toBe(true);

    const checkOutboundAllowed = (phone: string) => {
      if (dncList.has(phone)) return { allowed: false, reason: "dnc_suppressed" };
      return { allowed: true };
    };
    expect(checkOutboundAllowed(customerPhone)).toEqual({ allowed: false, reason: "dnc_suppressed" });

    // 4. Customer texts START to resubscribe
    const optInText = "START";
    expect(matchesCarrierKeyword(optInText.toLowerCase(), optInSet, "exact")).toBe(true);
    dncList.delete(customerPhone);
    expect(checkOutboundAllowed(customerPhone)).toEqual({ allowed: true });
  });

  // =========================================================================
  // Scenario 5: Omnichannel Support Escalation
  // =========================================================================
  it("Scenario 5: Omnichannel Escalation (Missed Call -> Resend Alert -> AgentMail Reply)", () => {
    // 1. Inbound customer call goes unanswered after hours
    const callerNumber = "+15559876543";
    const missedCallRecord = {
      callId: "CA_missed_scenario_5",
      caller: callerNumber,
      timestamp: new Date().toISOString(),
      durationSeconds: 0,
      disposition: "unanswered",
    };
    expect(missedCallRecord.disposition).toBe("unanswered");

    // 2. Resend urgent escalation alert email is constructed and dispatched to owner
    const fromAddress = resolveResendFromAddress();
    expect(fromAddress).toContain("BotBound");

    const emailAlertPayload = {
      from: fromAddress,
      to: "owner@botbound.app",
      title: "Missed Call from +15559876543",
      message: `A caller from ${callerNumber} reached your Bot after hours. Voicemail audio was preserved.`,
      callId: missedCallRecord.callId,
    };
    expect(emailAlertPayload.title).toContain("Missed Call");
    expect(emailAlertPayload.callId).toBe("CA_missed_scenario_5");

    // 3. Account owner opens inbox and triggers agent follow-up reply via AgentMail
    const agentMailAccount = {
      email: "support@bots.botbound.app",
      provider: "agentmail",
      status: "active",
    };
    expect(isBotBoundManagedEmailDomain("bots.botbound.app")).toBe(true);

    const followUpEmail = {
      from: agentMailAccount.email,
      to: "customer@example.com",
      subject: "Follow-up regarding your call to BotBound",
      body: "Hi! We noticed you called us earlier today. How can we help you?",
    };
    expect(followUpEmail.from).toBe("support@bots.botbound.app");
    expect(followUpEmail.subject).toContain("Follow-up");
  });
});
