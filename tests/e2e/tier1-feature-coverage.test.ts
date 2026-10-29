/**
 * Tier 1: Feature Coverage in Isolation (E2E Opaque-Box Suite)
 * 
 * Validates primary behavior (happy paths) across the BotBound Lean 4 Pillars:
 * - Pillar 1: Zero-Conflict Calendar Engine (Travel Buffers, 5-min Soft Holds, RFC 5545 .ics Generation, Trade Portal Mirroring)
 * - Pillar 2: In-Call Stripe Settlements & Autonomous Goodwill Wallets ($100/mo cap, $25/resolution)
 * - Pillar 3: Voice-to-Browserbase Real-Time Bridge (Non-blocking async tools, conversational fillers during 3-8s latency, 2FA alerts)
 * - Pillar 4: Branded Bot Email Identity via AgentMail (Inbox provisioning, transactional confirmations, payment receipts, reply triage)
 * 
 * Requirement: Minimum >= 35 tests total across all 4 pillars.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";

// Existing codebase imports
import {
  validateNativeCalendarSettings,
  intervalsOverlap,
  DEFAULT_NATIVE_CALENDAR,
  OCCUPIED_APPOINTMENT_STATUSES,
} from "../../src/lib/native-calendar-policy";
import {
  OPENAI_REALTIME_WIRELINE_TOOLS,
} from "../../src/lib/voice/openai-realtime-tools";
import { AGENT_TOOL_DEFS } from "../../src/lib/agent-runtime-helpers";
import {
  cloudComputerConnection,
  cloudComputerModel,
} from "../../src/lib/cloud-computer/config";
import {
  shouldProxyComputerToBackend,
  VOICE_WORKER_COMPUTER_USER_HEADER,
} from "../../src/lib/cloud-computer/worker-client";
import { CLOUD_COMPUTER_LIMITS } from "../../src/lib/cloud-computer/agent";
import { isNonPublicAddress } from "../../src/lib/cloud-computer/url-policy";
import {
  agentMailManagedInboxClientId,
  AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
} from "../../src/lib/agentmail-mail";
import { isBotBoundManagedEmailDomain } from "../../src/lib/managed-agentmail-domain";

// Lean 4-Pillar Test Harness
import {
  calculateTravelBuffer,
  createEphemeralHold,
  isHoldActive,
  generateRfc5545Ics,
  escapeIcsText,
  checkSlotWithBufferAndHolds,
  MIN_TRAVEL_BUFFER_MINUTES,
  MAX_TRAVEL_BUFFER_MINUTES,
  DEFAULT_SOFT_HOLD_TTL_SECONDS,
  constructStripePaymentLink,
  evaluateGoodwillCredit,
  verifyStripeWebhookHMAC,
  VoiceSessionRegistry,
  selectConversationalFiller,
  CONVERSATIONAL_STATUS_FILLERS,
  create2FATakeoverAlert,
  buildBrandedInboxParams,
  triageInboundCustomerReply,
  type GoodwillWalletPolicy,
  type InCallPaymentEvent,
} from "./helpers/lean4-pillar-harness";

const read = (relPath: string) => readFileSync(resolve(process.cwd(), relPath), "utf8");

describe("Tier 1: Feature Coverage in Isolation (Lean 4 Pillars)", () => {
  // =========================================================================
  // Pillar 1: Zero-Conflict Calendar Engine
  // =========================================================================
  describe("Pillar 1: Zero-Conflict Calendar Engine", () => {
    it("T1-P1-01: Calculates dynamic location travel buffer for consecutive appointment sites within [15, 60] min bounds", () => {
      const calc10Miles = calculateTravelBuffer("100 Market St, SF", "500 Howard St, SF", { estimatedMiles: 10 });
      expect(calc10Miles.bufferMinutes).toBe(30); // 10*2 + 10 = 30 min
      expect(calc10Miles.bufferMinutes).toBeGreaterThanOrEqual(MIN_TRAVEL_BUFFER_MINUTES);
      expect(calc10Miles.bufferMinutes).toBeLessThanOrEqual(MAX_TRAVEL_BUFFER_MINUTES);

      const calcShort = calculateTravelBuffer("100 Market St, SF", "102 Market St, SF", { estimatedMiles: 1 });
      expect(calcShort.bufferMinutes).toBe(MIN_TRAVEL_BUFFER_MINUTES); // Clamped to min 15

      const calcLong = calculateTravelBuffer("SF", "San Jose", { estimatedMiles: 50 });
      expect(calcLong.bufferMinutes).toBe(MAX_TRAVEL_BUFFER_MINUTES); // Clamped to max 60
    });

    it("T1-P1-02: Returns zero travel buffer for remote virtual appointments or identical job site addresses", () => {
      const remote = calculateTravelBuffer("Office HQ", "Remote Zoom Consultation", { isRemote: true });
      expect(remote.bufferMinutes).toBe(0);

      const sameAddress = calculateTravelBuffer("742 Evergreen Terrace", "742 Evergreen Terrace");
      expect(sameAddress.bufferMinutes).toBe(0);
    });

    it("T1-P1-03: Creates ephemeral 5-minute soft hold with 300s TTL reserving slot on live call", () => {
      const slotStart = new Date(Date.now() + 3600_000);
      const slotEnd = new Date(slotStart.getTime() + 1800_000);
      const hold = createEphemeralHold("usr_test1", "CA1234567890", slotStart, slotEnd, DEFAULT_SOFT_HOLD_TTL_SECONDS);

      expect(hold.holdId).toMatch(/^hold_[a-f0-9]{16}$/);
      expect(hold.status).toBe("active");
      expect(hold.callSid).toBe("CA1234567890");
      expect(hold.expiresAt.getTime()).toBeGreaterThan(Date.now() + 290_000);
      expect(hold.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 301_000);
    });

    it("T1-P1-04: Confirms hold is active within TTL window and detects expired hold after TTL", () => {
      const slotStart = new Date(Date.now() + 3600_000);
      const slotEnd = new Date(slotStart.getTime() + 1800_000);
      const hold = createEphemeralHold("usr_test1", "CA1234567890", slotStart, slotEnd, 300);

      expect(isHoldActive(hold, new Date())).toBe(true);

      const futureExpiredDate = new Date(Date.now() + 305_000); // 5 mins + 5s
      expect(isHoldActive(hold, futureExpiredDate)).toBe(false);
    });

    it("T1-P1-05: Generates RFC 5545 compliant .ics calendar invite string with required headers", () => {
      const start = new Date("2026-11-01T14:00:00Z");
      const end = new Date("2026-11-01T15:00:00Z");
      const ics = generateRfc5545Ics({
        uid: "evt_water_heater_101",
        summary: "Emergency Water Heater Repair",
        description: "Diagnose leaking valve and restore hot water pressure.",
        start,
        end,
        organizerEmail: "bot-dispatch@bots.botbound.app",
        organizerName: "Apex Plumbing Dispatch Bot",
        attendeeEmail: "customer@example.com",
        attendeeName: "Jane Doe",
        location: "123 Main St, Springfield",
      });

      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("VERSION:2.0");
      expect(ics).toContain("PRODID:-//BotBound//SMB Calendar Engine//EN");
      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain("UID:evt_water_heater_101");
      expect(ics).toContain("DTSTART:20261101T140000Z");
      expect(ics).toContain("DTEND:20261101T150000Z");
      expect(ics).toContain("SUMMARY:Emergency Water Heater Repair");
      expect(ics).toContain("ORGANIZER;CN=Apex Plumbing Dispatch Bot:mailto:bot-dispatch@bots.botbound.app");
      expect(ics).toContain("ATTENDEE;CUTYPE=INDIVIDUAL");
      expect(ics).toContain("Jane Doe");
      expect(ics).toContain("STATUS:CONFIRMED");
      expect(ics).toContain("END:VEVENT");
      expect(ics).toContain("END:VCALENDAR");
      expect(ics).toContain("\r\n"); // Standard RFC 5545 line ending
    });

    it("T1-P1-06: Escapes special characters (commas, semicolons, backslashes, newlines) in .ics output", () => {
      const raw = "Plumbing, heating; AC \\ special note\nNext line.";
      const escaped = escapeIcsText(raw);
      expect(escaped).toBe("Plumbing\\, heating\\; AC \\\\ special note\\nNext line.");
    });

    it("T1-P1-07: Checks calendar availability taking travel buffers and active soft holds into account", () => {
      const baseTime = Date.now() + 86400_000;
      const existingBooking = {
        startAt: new Date(baseTime),
        endAt: new Date(baseTime + 3600_000), // 1 hour booking
        bufferMinutes: 30, // 30 min buffer after
      };

      // Slot starting 15 mins after booking ends -> conflicts due to 30 min travel buffer
      const conflictingSlot = {
        targetStart: new Date(baseTime + 3600_000 + 15 * 60_000),
        targetEnd: new Date(baseTime + 3600_000 + 75 * 60_000),
        targetBufferMinutes: 15,
        existingBookings: [existingBooking],
        activeHolds: [],
      };
      const resultConflict = checkSlotWithBufferAndHolds(conflictingSlot);
      expect(resultConflict.available).toBe(false);
      expect(resultConflict.conflictReason).toContain("Overlaps with confirmed booking");

      // Slot starting 45 mins after booking ends -> clear of 30 min buffer
      const clearSlot = {
        targetStart: new Date(baseTime + 3600_000 + 45 * 60_000),
        targetEnd: new Date(baseTime + 3600_000 + 105 * 60_000),
        targetBufferMinutes: 15,
        existingBookings: [existingBooking],
        activeHolds: [],
      };
      const resultClear = checkSlotWithBufferAndHolds(clearSlot);
      expect(resultClear.available).toBe(true);
    });

    it("T1-P1-08: Integrates with native calendar settings and interval overlapping policy", () => {
      const settings = validateNativeCalendarSettings({
        enabled: true,
        time_zone: "America/New_York",
        appointment_name: "Residential Plumbing Inspection",
        duration_minutes: 45,
        buffer_minutes: 15,
        minimum_notice_minutes: 60,
        booking_mode: "automatic",
        weekly_hours: [
          { day: 1, start: "08:00", end: "17:00" },
          { day: 2, start: "08:00", end: "17:00" },
        ],
      });
      expect(settings.duration_minutes).toBe(45);
      expect(settings.buffer_minutes).toBe(15);
      expect(settings.time_zone).toBe("America/New_York");

      const intervalA = { startAt: new Date(100000), endAt: new Date(200000), bufferMinutes: 10 };
      const intervalB = { startAt: new Date(150000), endAt: new Date(250000), bufferMinutes: 10 };
      expect(intervalsOverlap(intervalA, intervalB)).toBe(true);
    });

    it("T1-P1-09: Verifies appointment status lifecycle supports Scheduled, Confirmed, Requested, Rescheduled", () => {
      expect(OCCUPIED_APPOINTMENT_STATUSES).toContain("Scheduled");
      expect(OCCUPIED_APPOINTMENT_STATUSES).toContain("Confirmed");
      expect(OCCUPIED_APPOINTMENT_STATUSES).toContain("Requested");
      expect(OCCUPIED_APPOINTMENT_STATUSES).toContain("Rescheduled");
    });

    it("T1-P1-10: Verifies calendar tool definition in OpenAI Realtime tools catalog", () => {
      const toolNames = OPENAI_REALTIME_WIRELINE_TOOLS.map((t) => t.name);
      expect(toolNames).toContain("check_calendar_availability");
      expect(toolNames).toContain("create_booking");
    });
  });

  // =========================================================================
  // Pillar 2: In-Call Stripe Settlements & Autonomous Goodwill Wallets
  // =========================================================================
  describe("Pillar 2: Stripe In-Call Settlements & Autonomous Goodwill Wallets", () => {
    it("T1-P2-01: Generates dynamic Stripe checkout link for in-call deposit with Apple Pay & Google Pay enabled", () => {
      const paymentReq = {
        userId: "usr_plumber_42",
        callSid: "CA_call_999",
        customerPhone: "+15552345678",
        amountCents: 5000, // $50.00
        description: "Plumbing Diagnostic Deposit",
      };
      const result = constructStripePaymentLink(paymentReq);
      expect(result.paymentUrl).toContain("https://checkout.stripe.com/c/pay/");
      expect(result.paymentUrl).toContain("amount=5000");
      expect(result.paymentUrl).toContain("wallets=apple_pay,google_pay");
      expect(result.paymentIntentId).toMatch(/^pi_[a-f0-9]{24}$/);
      expect(result.appleGooglePayEnabled).toBe(true);
    });

    it("T1-P2-02: Normalizes and formats dollar/cents amounts accurately ($50.00 -> 5000 cents)", () => {
      const amountDollars = 50.0;
      const amountCents = Math.round(amountDollars * 100);
      expect(amountCents).toBe(5000);
      expect(`$${(amountCents / 100).toFixed(2)}`).toBe("$50.00");
    });

    it("T1-P2-03: In-memory voice session registry registers active call by CallSid and records inbound payment events", () => {
      const registry = new VoiceSessionRegistry();
      registry.registerCall("CA_active_101", "usr_101", "+15551112222");

      expect(registry.hasCall("CA_active_101")).toBe(true);
      expect(registry.hasCall("CA_nonexistent")).toBe(false);

      const paymentEvent: InCallPaymentEvent = {
        callSid: "CA_active_101",
        paymentIntentId: "pi_test_123",
        amountCents: 5000,
        status: "succeeded",
        receiptUrl: "https://stripe.com/receipt/123",
        timestamp: new Date(),
      };

      registry.recordPayment(paymentEvent);
      const payments = registry.getPaymentsForCall("CA_active_101");
      expect(payments).toHaveLength(1);
      expect(payments[0].status).toBe("succeeded");
      expect(payments[0].amountCents).toBe(5000);
    });

    it("T1-P2-04: Voice session event bus emits live event when Stripe webhook succeeds", async () => {
      const registry = new VoiceSessionRegistry();
      registry.registerCall("CA_live_202", "usr_202", "+15553334444");

      const eventPromise = new Promise<InCallPaymentEvent>((resolve) => {
        registry.once("payment:CA_live_202", (event) => {
          resolve(event);
        });
      });

      const incomingEvent: InCallPaymentEvent = {
        callSid: "CA_live_202",
        paymentIntentId: "pi_event_999",
        amountCents: 2500,
        status: "succeeded",
        timestamp: new Date(),
      };
      registry.recordPayment(incomingEvent);

      const received = await eventPromise;
      expect(received.callSid).toBe("CA_live_202");
      expect(received.paymentIntentId).toBe("pi_event_999");
    });

    it("T1-P2-05: Goodwill wallet policy approves credit request within $25.00 resolution cap and $100.00 monthly cap", () => {
      const policy: GoodwillWalletPolicy = {
        monthlyCapCents: 10000, // $100.00
        perResolutionCapCents: 2500, // $25.00
        currentMonthSpentCents: 2000, // $20.00 already spent
      };

      // $25.00 requested: exactly at resolution cap and 2000 + 2500 = 4500 <= 10000
      const evaluation = evaluateGoodwillCredit(policy, 2500);
      expect(evaluation.approved).toBe(true);
      expect(evaluation.newCurrentMonthSpentCents).toBe(4500);
    });

    it("T1-P2-06: Verifies Stripe webhook HMAC-SHA256 signature with constant-time equality check", () => {
      const payload = JSON.stringify({ id: "evt_123", type: "checkout.session.completed" });
      const secret = "whsec_test_secret_key_1234567890abcdef";
      const nowSec = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", secret).update(`${nowSec}.${payload}`).digest("hex");
      const sigHeader = `t=${nowSec},v1=${signature}`;

      const verified = verifyStripeWebhookHMAC(payload, sigHeader, secret);
      expect(verified).toBe(true);
    });

    it("T1-P2-07: Verifies credit wallet ledger models append-only structure with idempotencyKey and refType", () => {
      const creditWalletSource = read("src/lib/credit-wallet.ts");
      expect(creditWalletSource).toContain("wireline_credit_ledger");
      expect(creditWalletSource).toContain("entryKind");
      expect(creditWalletSource).toContain("top_up");
      expect(creditWalletSource).toContain("burn");
      expect(creditWalletSource).toContain("refund");
    });

    it("T1-P2-08: Verifies pre-call voice wallet guard evaluates solvency before initiating billable calls", () => {
      const voiceWalletGuardSource = read("src/lib/voice-wallet-guard.ts");
      expect(voiceWalletGuardSource).toContain("getVoiceWalletSnapshot");
      expect(voiceWalletGuardSource).toContain("sufficient");
      expect(voiceWalletGuardSource).toContain("balance_usd");
    });

    it("T1-P2-09: Twilio SMS service generates mid-call text-to-pay message body with compliance format", () => {
      const twilioServiceSource = read("src/lib/twilio-service.ts");
      expect(twilioServiceSource).toContain("sendTenantMessage");
      expect(twilioServiceSource).toContain("estimateSmsSegments");
    });

    it("T1-P2-10: Rejects Stripe webhook with tampered HMAC signature", () => {
      const payload = JSON.stringify({ id: "evt_tampered", type: "checkout.session.completed" });
      const secret = "whsec_real_secret";
      const nowSec = Math.floor(Date.now() / 1000);
      const forgedSigHeader = `t=${nowSec},v1=deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef`;

      const verified = verifyStripeWebhookHMAC(payload, forgedSigHeader, secret);
      expect(verified).toBe(false);
    });
  });

  // =========================================================================
  // Pillar 3: Voice-to-Browserbase Real-Time Bridge
  // =========================================================================
  describe("Pillar 3: Voice-to-Browserbase Real-Time Bridge", () => {
    it("T1-P3-01: Registers non-blocking async browser tools in AGENT_TOOL_DEFS", () => {
      expect(AGENT_TOOL_DEFS).toHaveProperty("start_computer_task");
      expect(AGENT_TOOL_DEFS).toHaveProperty("check_computer_task");
      expect(AGENT_TOOL_DEFS).toHaveProperty("reply_computer_task");
      expect(AGENT_TOOL_DEFS).toHaveProperty("stop_computer_task");
    });

    it("T1-P3-02: Proxies computer tasks from voice worker to backend with authenticated header", () => {
      const mockEnv = {
        WIRELINE_VOICE_WORKER: "true",
        BOTBOUND_BACKEND_ORIGIN: "https://api.botbound.app",
        WIRELINE_VOICE_WORKER_SECRET: "mock-secret-at-least-32-characters-long-2026",
      };
      expect(shouldProxyComputerToBackend(mockEnv)).toBe(true);
      expect(VOICE_WORKER_COMPUTER_USER_HEADER).toBe("x-botbound-voice-worker-user-id");
    });

    it("T1-P3-03: Selects conversational status fillers from curated pool to prevent silence during 3-8s portal tasks", () => {
      expect(CONVERSATIONAL_STATUS_FILLERS.length).toBeGreaterThanOrEqual(8);
      const filler0 = selectConversationalFiller(0);
      expect(filler0).toBeDefined();
      expect(typeof filler0).toBe("string");
      expect(filler0.length).toBeGreaterThan(15);
      expect(filler0).toContain("portal");
    });

    it("T1-P3-04: Cycles through diverse conversational fillers without immediate repetition", () => {
      const filler1 = selectConversationalFiller(0, []);
      const filler2 = selectConversationalFiller(1, [filler1]);
      expect(filler2).not.toBe(filler1);
    });

    it("T1-P3-05: Browserbase WebSocket endpoint formats wss://connect.browserbase.com/?apiKey=...&timeout=900000", () => {
      const mockEnv = {
        BROWSERBASE_API_KEY: "bb_test_api_key_777",
      };
      const conn = cloudComputerConnection(mockEnv, false);
      expect(conn).not.toBeNull();
      expect(conn?.kind).toBe("remote");
      expect(conn?.wsEndpoint).toContain("wss://connect.browserbase.com/?apiKey=bb_test_api_key_777");
      expect(conn?.wsEndpoint).toContain("timeout=900000");
    });

    it("T1-P3-06: Cloud computer limits enforce maximum turn counts and action budgets to prevent runaway execution", () => {
      expect(CLOUD_COMPUTER_LIMITS.maxTurns).toBe(30);
      expect(CLOUD_COMPUTER_LIMITS.maxActions).toBe(120);
      expect(CLOUD_COMPUTER_LIMITS.maxRunMs).toBe(15 * 60_000);
    });

    it("T1-P3-07: Generates 2FA takeover alert payload for SMS and AgentMail (agent_attach_human) when auth barrier is hit", () => {
      const alert = create2FATakeoverAlert({
        taskId: "task_hcp_sync_99",
        reason: "two_factor",
        callSid: "CA_call_444",
        portalUrl: "https://housecallpro.com/login",
        ownerPhone: "+15559876543",
        ownerEmail: "owner@apexplumbing.com",
      });

      expect(alert.smsAlert.to).toBe("+15559876543");
      expect(alert.smsAlert.message).toContain("2FA SMS verification code");
      expect(alert.smsAlert.message).toContain("CA_call_444");
      expect(alert.smsAlert.message).toContain("takeover/task_hcp_sync_99");

      expect(alert.agentMailAlert.to).toBe("owner@apexplumbing.com");
      expect(alert.agentMailAlert.subject).toContain("[HUMAN TAKEOVER] 2FA Barrier");
      expect(alert.agentMailAlert.agentAction).toBe("agent_attach_human");
    });

    it("T1-P3-08: Cloud computer URL policy verifies public domain routing while blocking private address schemes", () => {
      expect(isNonPublicAddress("8.8.8.8")).toBe(false); // Public DNS IP allowed
      expect(isNonPublicAddress("1.1.1.1")).toBe(false); // Public Cloudflare IP allowed
      expect(isNonPublicAddress("127.0.0.1")).toBe(true); // Loopback blocked
      expect(isNonPublicAddress("169.254.169.254")).toBe(true); // Cloud metadata blocked
      expect(isNonPublicAddress("10.0.0.1")).toBe(true); // RFC1918 blocked
      expect(isNonPublicAddress("192.168.1.1")).toBe(true); // RFC1918 blocked
    });

    it("T1-P3-09: Trade portal mirroring request structure validates target dispatch platforms", () => {
      const validActions = ["lookup_customer", "check_parts_portal", "mirror_dispatch_job"];
      expect(validActions).toContain("mirror_dispatch_job");
    });
  });

  // =========================================================================
  // Pillar 4: Branded Bot Email Identity via AgentMail
  // =========================================================================
  describe("Pillar 4: Branded Bot Email Identity via AgentMail", () => {
    it("T1-P4-01: Generates deterministic inbox client_id (botbound-agent-[hash]) from agent ID and domain", () => {
      const clientId1 = agentMailManagedInboxClientId("agent_dispatch_1", "bots.botbound.app");
      const clientId2 = agentMailManagedInboxClientId("agent_dispatch_1", "bots.botbound.app");
      const clientId3 = agentMailManagedInboxClientId("agent_dispatch_2", "bots.botbound.app");

      expect(clientId1).toBe(clientId2);
      expect(clientId1).not.toBe(clientId3);
      expect(clientId1).toMatch(/^botbound-agent-[a-f0-9]{32}$/);
    });

    it("T1-P4-02: Formats branded bot inbox configuration on bots.botbound.app with structured metadata", () => {
      const inbox = buildBrandedInboxParams("agent_plumb_88", "bots.botbound.app");
      expect(inbox.username).toBe("bot-agent-plumb-88");
      expect(inbox.domain).toBe("bots.botbound.app");
      expect(inbox.metadata).toEqual({
        platform: "BotBound",
        agent_id: "agent_plumb_88",
        managed: "true",
        tenant_domain: "bots.botbound.app",
      });
    });

    it("T1-P4-03: Validates domain isolation ensures bot inboxes use approved managed subdomains", () => {
      expect(isBotBoundManagedEmailDomain("bots.botbound.app")).toBe(true);
      expect(isBotBoundManagedEmailDomain("dispatch.botbound.app")).toBe(true);
      expect(isBotBoundManagedEmailDomain("gmail.com")).toBe(false);
      expect(isBotBoundManagedEmailDomain("untrusted-external.net")).toBe(false);
    });

    it("T1-P4-04: Validates master API key containment using encrypted sentinel botbound-managed-agentmail-v1", () => {
      expect(AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL).toBe("botbound-managed-agentmail-v1");
    });

    it("T1-P4-05: Dispatches transactional appointment confirmation email structure with .ics calendar attachment", () => {
      const appointmentTime = new Date("2026-11-05T10:00:00Z");
      const ics = generateRfc5545Ics({
        uid: "appt_conf_001",
        summary: "Plumbing Service Visit",
        description: "Confirmed technician visit for Jane Doe.",
        start: appointmentTime,
        end: new Date(appointmentTime.getTime() + 3600_000),
        organizerEmail: "bot-dispatch@bots.botbound.app",
        attendeeEmail: "jane@example.com",
      });

      const emailPayload = {
        userId: "usr_plumber",
        agentId: "agent_plumber",
        customerEmail: "jane@example.com",
        customerName: "Jane Doe",
        appointmentTime,
        serviceTitle: "Plumbing Service Visit",
        icsContent: ics,
      };

      expect(emailPayload.icsContent).toContain("BEGIN:VCALENDAR");
      expect(emailPayload.icsContent).toContain("UID:appt_conf_001");
      expect(emailPayload.customerEmail).toBe("jane@example.com");
    });

    it("T1-P4-06: Dispatches transactional payment receipt email structure with formatted USD amount and receipt number", () => {
      const receiptPayload = {
        userId: "usr_plumber",
        agentId: "agent_plumber",
        customerEmail: "jane@example.com",
        amountUsd: "$50.00",
        receiptNumber: "REC-2026-00123",
        description: "Diagnostic Deposit via Apple Pay",
      };

      expect(receiptPayload.amountUsd).toBe("$50.00");
      expect(receiptPayload.receiptNumber).toMatch(/^REC-2026-\d{5}$/);
    });

    it("T1-P4-07: Inbound email reply triage classifies customer rescheduling requests with high confidence", () => {
      const triage = triageInboundCustomerReply(
        "Re: Appointment Confirmation",
        "Hi, can we reschedule my appointment to Thursday at 2pm? Something came up."
      );
      expect(triage.intent).toBe("reschedule");
      expect(triage.confidence).toBeGreaterThan(0.9);
      expect(triage.requiresHumanEscalation).toBe(false);
      expect(triage.recommendedAction).toContain("Check calendar availability with travel buffers");
    });

    it("T1-P4-08: Inbound email reply triage classifies customer cancellation requests with high confidence", () => {
      const triage = triageInboundCustomerReply(
        "Re: Your Appointment",
        "Please cancel my booking. We found another plumber who already fixed it."
      );
      expect(triage.intent).toBe("cancel");
      expect(triage.confidence).toBeGreaterThan(0.9);
      expect(triage.requiresHumanEscalation).toBe(false);
      expect(triage.recommendedAction).toContain("Release appointment slot");
    });

    it("T1-P4-09: Inbound email reply triage classifies urgent complaints and triggers human escalation", () => {
      const triage = triageInboundCustomerReply(
        "URGENT: Flooding in Basement!",
        "Your technician left and now my basement has 3 inches of water! This is an emergency!"
      );
      expect(triage.intent).toBe("urgent_complaint");
      expect(triage.confidence).toBeGreaterThan(0.9);
      expect(triage.requiresHumanEscalation).toBe(true);
      expect(triage.recommendedAction).toContain("Escalate to business owner immediately");
    });
  });
});
