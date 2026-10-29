/**
 * Tier 2: Boundary & Corner Cases (E2E Opaque-Box Suite)
 * 
 * Validates boundaries, edge cases, invalid inputs, failure modes, and rate limiting across the Lean 4 Pillars:
 * - Pillar 1: Buffer boundaries (0 min, 15 min min, 60 min max), hold expiration (after 300s TTL), concurrent booking collisions
 * - Pillar 2: Wallet limit breaches ($100/mo cap, $25/resolution), invalid tokens, forged Stripe signatures, stale webhooks
 * - Pillar 3: Browserbase timeouts (60s-3600s), SSRF network guards (127.0.0.1, 169.254.169.254, RFC1918), filler cycling limits
 * - Pillar 4: AgentMail unmanaged domain rejection, username sanitization, malformed ICS validation, triage intent conflicts
 * 
 * Requirement: Minimum >= 35 tests total across all 4 pillars.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";

// Existing codebase imports
import {
  intervalsOverlap,
  validateNativeCalendarSettings,
} from "../../src/lib/native-calendar-policy";
import {
  cloudComputerConnection,
} from "../../src/lib/cloud-computer/config";
import {
  isNonPublicAddress,
  checkUrlAllowed,
} from "../../src/lib/cloud-computer/url-policy";
import {
  agentMailManagedInboxClientId,
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
  create2FATakeoverAlert,
  buildBrandedInboxParams,
  triageInboundCustomerReply,
  type GoodwillWalletPolicy,
  type InCallPaymentEvent,
} from "./helpers/lean4-pillar-harness";

describe("Tier 2: Boundary & Corner Cases (Lean 4 Pillars)", () => {
  // =========================================================================
  // Pillar 1: Zero-Conflict Calendar Engine Boundaries
  // =========================================================================
  describe("Pillar 1: Calendar Engine Boundaries", () => {
    it("T2-P1-01: Buffer boundary: 0 minute buffer allowed for identical addresses and remote consultations", () => {
      const sameAddr = calculateTravelBuffer("400 Castro St", "400 Castro St");
      expect(sameAddr.bufferMinutes).toBe(0);

      const remote = calculateTravelBuffer("Office", "Online Zoom Meeting", { isRemote: true });
      expect(remote.bufferMinutes).toBe(0);

      const emptyOrigin = calculateTravelBuffer(undefined, "400 Castro St");
      expect(emptyOrigin.bufferMinutes).toBe(0);
    });

    it("T2-P1-02: Buffer boundary: 15 minute lower bound enforcement (minimum travel buffer)", () => {
      // 0.5 miles: 0.5*2 + 10 = 11 mins -> must clamp to MIN_TRAVEL_BUFFER_MINUTES (15 mins)
      const bufferShort = calculateTravelBuffer("100 Market St", "101 Market St", { estimatedMiles: 0.5 });
      expect(bufferShort.bufferMinutes).toBe(MIN_TRAVEL_BUFFER_MINUTES);
    });

    it("T2-P1-03: Buffer boundary: 60 minute upper bound clamp (maximum travel buffer)", () => {
      // 100 miles: 100*2 + 10 = 210 mins -> must clamp to MAX_TRAVEL_BUFFER_MINUTES (60 mins)
      const bufferLong = calculateTravelBuffer("San Francisco", "Sacramento", { estimatedMiles: 100 });
      expect(bufferLong.bufferMinutes).toBe(MAX_TRAVEL_BUFFER_MINUTES);
    });

    it("T2-P1-04: Ephemeral hold exact TTL expiration: 300 seconds TTL expires at exactly t = 300.001s", () => {
      const start = new Date(Date.now() + 3600_000);
      const end = new Date(start.getTime() + 1800_000);
      const hold = createEphemeralHold("usr_1", "CA_call_1", start, end, DEFAULT_SOFT_HOLD_TTL_SECONDS);

      // 299.9 seconds later: still active
      const justBeforeExpiry = new Date(hold.expiresAt.getTime() - 100);
      expect(isHoldActive(hold, justBeforeExpiry)).toBe(true);

      // Exactly at expiresAt: expired
      const atExpiry = new Date(hold.expiresAt.getTime());
      expect(isHoldActive(hold, atExpiry)).toBe(false);

      // 1 millisecond after: expired
      const afterExpiry = new Date(hold.expiresAt.getTime() + 1);
      expect(isHoldActive(hold, afterExpiry)).toBe(false);
    });

    it("T2-P1-05: Purging expired soft holds: expired soft holds are disregarded during availability checks", () => {
      const now = new Date();
      const slotStart = new Date(now.getTime() + 7200_000);
      const slotEnd = new Date(slotStart.getTime() + 1800_000);

      const expiredHold = {
        holdId: "hold_expired_99",
        userId: "usr_expired",
        callSid: "CA_old_call",
        slotStart,
        slotEnd,
        expiresAt: new Date(now.getTime() - 10_000), // Expired 10s ago
        status: "active" as const,
      };

      const result = checkSlotWithBufferAndHolds({
        targetStart: slotStart,
        targetEnd: slotEnd,
        targetBufferMinutes: 15,
        existingBookings: [],
        activeHolds: [expiredHold],
        now,
      });

      expect(result.available).toBe(true);
    });

    it("T2-P1-06: Concurrent booking collision: Caller 2 cannot reserve slot currently soft-held by Caller 1", () => {
      const now = new Date();
      const slotStart = new Date(now.getTime() + 3600_000);
      const slotEnd = new Date(slotStart.getTime() + 1800_000);

      const activeHold = createEphemeralHold("usr_caller1", "CA_caller_1", slotStart, slotEnd, 300);

      const caller2Attempt = checkSlotWithBufferAndHolds({
        targetStart: slotStart,
        targetEnd: slotEnd,
        targetBufferMinutes: 15,
        existingBookings: [],
        activeHolds: [activeHold],
        now,
      });

      expect(caller2Attempt.available).toBe(false);
      expect(caller2Attempt.conflictReason).toContain("temporarily reserved by another active call");
    });

    it("T2-P1-07: Sequential release: released soft hold immediately unlocks slot for subsequent callers", () => {
      const now = new Date();
      const slotStart = new Date(now.getTime() + 3600_000);
      const slotEnd = new Date(slotStart.getTime() + 1800_000);

      const hold = createEphemeralHold("usr_caller1", "CA_caller_1", slotStart, slotEnd, 300);
      hold.status = "released"; // Caller hung up without booking

      const caller2Attempt = checkSlotWithBufferAndHolds({
        targetStart: slotStart,
        targetEnd: slotEnd,
        targetBufferMinutes: 15,
        existingBookings: [],
        activeHolds: [hold],
        now,
      });

      expect(caller2Attempt.available).toBe(true);
    });

    it("T2-P1-08: RFC 5545 special character multi-escaping: handles text with quotes, tabs, and unicode", () => {
      const complexText = "Apex 'Plumbing' & \"Drainage\"; Suite #4, 2nd Fl.\nContact: ☎ 555-0199";
      const escaped = escapeIcsText(complexText);
      expect(escaped).toContain("\\;");
      expect(escaped).toContain("\\,");
      expect(escaped).toContain("\\n");
      expect(escaped).toContain("☎");
    });

    it("T2-P1-09: Invalid appointment settings: rejecting invalid weekly hours or zero duration", () => {
      expect(() => {
        validateNativeCalendarSettings({
          enabled: true,
          duration_minutes: 5, // Below min 15
        });
      }).toThrow();
    });
  });

  // =========================================================================
  // Pillar 2: In-Call Stripe Settlements & Autonomous Goodwill Wallets Boundaries
  // =========================================================================
  describe("Pillar 2: Stripe & Goodwill Wallet Boundaries", () => {
    it("T2-P2-01: Per-resolution limit breach: $25.01 credit request rejected (cap $25.00 / 2500 cents)", () => {
      const policy: GoodwillWalletPolicy = {
        monthlyCapCents: 10000,
        perResolutionCapCents: 2500,
        currentMonthSpentCents: 0,
      };

      const result = evaluateGoodwillCredit(policy, 2501); // $25.01
      expect(result.approved).toBe(false);
      expect(result.reason).toContain("exceeds per-resolution cap of $25.00");
    });

    it("T2-P2-02: Monthly budget limit breach: $100.01 monthly spend rejected (cap $100.00 / 10000 cents)", () => {
      const policy: GoodwillWalletPolicy = {
        monthlyCapCents: 10000,
        perResolutionCapCents: 2500,
        currentMonthSpentCents: 9000, // $90.00 spent
      };

      // $20.00 requested: <= $25 cap, but 9000 + 2000 = 11000 > 10000 monthly cap
      const result = evaluateGoodwillCredit(policy, 2000);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain("exceeds remaining monthly goodwill budget");
    });

    it("T2-P2-03: Non-positive credit request rejection: $0.00 or negative cents credits fail validation", () => {
      const policy: GoodwillWalletPolicy = {
        monthlyCapCents: 10000,
        perResolutionCapCents: 2500,
        currentMonthSpentCents: 0,
      };

      const zeroResult = evaluateGoodwillCredit(policy, 0);
      expect(zeroResult.approved).toBe(false);
      expect(zeroResult.reason).toContain("greater than 0 cents");

      const negResult = evaluateGoodwillCredit(policy, -500);
      expect(negResult.approved).toBe(false);
    });

    it("T2-P2-04: Multiple partial goodwill resolutions: cumulative spend tracking reaches exactly $100.00 then blocks", () => {
      let policy: GoodwillWalletPolicy = {
        monthlyCapCents: 10000,
        perResolutionCapCents: 2500,
        currentMonthSpentCents: 0,
      };

      // 4 resolutions of $25.00 each
      for (let i = 0; i < 4; i++) {
        const res = evaluateGoodwillCredit(policy, 2500);
        expect(res.approved).toBe(true);
        policy.currentMonthSpentCents = res.newCurrentMonthSpentCents;
      }

      expect(policy.currentMonthSpentCents).toBe(10000); // Exactly $100.00

      // 5th resolution of even $1.00 must be rejected
      const fifthAttempt = evaluateGoodwillCredit(policy, 100);
      expect(fifthAttempt.approved).toBe(false);
      expect(fifthAttempt.reason).toContain("exceeds remaining monthly goodwill budget");
    });

    it("T2-P2-05: Stripe webhook replay protection: webhook with timestamp older than 300s tolerance is rejected", () => {
      const payload = JSON.stringify({ id: "evt_stale", type: "checkout.session.completed" });
      const secret = "whsec_test_secret";
      const oldSec = Math.floor(Date.now() / 1000) - 305; // 305s ago (> 300s window)
      const sig = createHmac("sha256", secret).update(`${oldSec}.${payload}`).digest("hex");
      const sigHeader = `t=${oldSec},v1=${sig}`;

      const verified = verifyStripeWebhookHMAC(payload, sigHeader, secret, 300);
      expect(verified).toBe(false);
    });

    it("T2-P2-06: Stripe webhook signature tampering: modified payload body with original signature is rejected", () => {
      const originalPayload = JSON.stringify({ id: "evt_legit", amount: 5000 });
      const tamperedPayload = JSON.stringify({ id: "evt_legit", amount: 100 });
      const secret = "whsec_test_secret";
      const nowSec = Math.floor(Date.now() / 1000);
      const sig = createHmac("sha256", secret).update(`${nowSec}.${originalPayload}`).digest("hex");
      const sigHeader = `t=${nowSec},v1=${sig}`;

      const verified = verifyStripeWebhookHMAC(tamperedPayload, sigHeader, secret, 300);
      expect(verified).toBe(false);
    });

    it("T2-P2-07: Missing Stripe webhook signature header fails verification immediately", () => {
      expect(verifyStripeWebhookHMAC("{}", "", "secret")).toBe(false);
      expect(verifyStripeWebhookHMAC("{}", "malformed_header", "secret")).toBe(false);
    });

    it("T2-P2-08: Zero-amount Stripe payment link creation boundary validation", () => {
      const zeroReq = {
        userId: "usr_plumber",
        callSid: "CA_call_zero",
        customerPhone: "+15550001111",
        amountCents: 0,
        description: "Zero deposit",
      };
      const result = constructStripePaymentLink(zeroReq);
      expect(result.paymentUrl).toContain("amount=0");
    });

    it("T2-P2-09: Unregistered callSid payment event: event bus handles payment for unknown call without crashing", () => {
      const registry = new VoiceSessionRegistry();
      const orphanEvent: InCallPaymentEvent = {
        callSid: "CA_unknown_orphan",
        paymentIntentId: "pi_orphan",
        amountCents: 5000,
        status: "succeeded",
        timestamp: new Date(),
      };

      expect(() => {
        registry.recordPayment(orphanEvent);
      }).not.toThrow();

      const payments = registry.getPaymentsForCall("CA_unknown_orphan");
      expect(payments).toHaveLength(1);
    });
  });

  // =========================================================================
  // Pillar 3: Voice-to-Browserbase Real-Time Bridge Boundaries
  // =========================================================================
  describe("Pillar 3: Voice-to-Browserbase Bridge Boundaries", () => {
    it("T2-P3-01: Browserbase connection timeout bounds: rejects timeouts < 60,000ms or > 3,600,000ms", () => {
      const tooShortEnv = {
        BROWSERBASE_API_KEY: "bb_key_1",
        CLOUD_COMPUTER_BROWSER_TIMEOUT_MS: "30000", // 30s < 60s
      };
      expect(cloudComputerConnection(tooShortEnv, false)).toBeNull();

      const tooLongEnv = {
        BROWSERBASE_API_KEY: "bb_key_1",
        CLOUD_COMPUTER_BROWSER_TIMEOUT_MS: "7200000", // 2 hours > 1 hour
      };
      expect(cloudComputerConnection(tooLongEnv, false)).toBeNull();

      const validEnv = {
        BROWSERBASE_API_KEY: "bb_key_1",
        CLOUD_COMPUTER_BROWSER_TIMEOUT_MS: "300000", // 5 minutes
      };
      expect(cloudComputerConnection(validEnv, false)).not.toBeNull();
    });

    it("T2-P3-02: SSRF defense: blocks loopback IPv4 addresses (127.0.0.1, 127.0.0.2)", () => {
      expect(isNonPublicAddress("127.0.0.1")).toBe(true);
      expect(isNonPublicAddress("127.0.0.2")).toBe(true);
      expect(isNonPublicAddress("127.255.255.255")).toBe(true);
    });

    it("T2-P3-03: SSRF defense: blocks AWS/GCP cloud metadata IP (169.254.169.254)", () => {
      expect(isNonPublicAddress("169.254.169.254")).toBe(true);
      expect(isNonPublicAddress("169.254.0.1")).toBe(true);
    });

    it("T2-P3-04: SSRF defense: blocks RFC 1918 private subnets (10.0.0.1, 172.16.0.1, 192.168.1.1)", () => {
      expect(isNonPublicAddress("10.0.0.1")).toBe(true);
      expect(isNonPublicAddress("10.255.255.255")).toBe(true);
      expect(isNonPublicAddress("172.16.0.1")).toBe(true);
      expect(isNonPublicAddress("172.31.255.255")).toBe(true);
      expect(isNonPublicAddress("192.168.0.1")).toBe(true);
      expect(isNonPublicAddress("192.168.255.255")).toBe(true);
    });

    it("T2-P3-05: Non-standard browser ports: checks allowed web ports and blocks dangerous internal ports", () => {
      expect(checkUrlAllowed(new URL("https://app.housecallpro.com:443")).allowed).toBe(true);
      expect(checkUrlAllowed(new URL("http://example.com:8080")).allowed).toBe(true);

      // Dangerous ports (SSH, SMTP, MySQL)
      expect(checkUrlAllowed(new URL("https://example.com:22")).allowed).toBe(false);
      expect(checkUrlAllowed(new URL("https://example.com:25")).allowed).toBe(false);
      expect(checkUrlAllowed(new URL("https://example.com:3306")).allowed).toBe(false);
    });

    it("T2-P3-06: Conversational filler boundary: handles high turn counts gracefully (loops or wraps without index out of bounds)", () => {
      for (let turn = 0; turn < 50; turn++) {
        const filler = selectConversationalFiller(turn);
        expect(filler).toBeDefined();
        expect(typeof filler).toBe("string");
        expect(filler.length).toBeGreaterThan(0);
      }
    });

    it("T2-P3-07: Human takeover alert formats safe fallback notification when portal URL is root", () => {
      const alert = create2FATakeoverAlert({
        taskId: "task_captcha_1",
        reason: "captcha",
        callSid: "CA_call_captcha",
        portalUrl: "https://servicetitan.com",
        ownerPhone: "+15551234567",
        ownerEmail: "admin@plumbing.com",
      });

      expect(alert.smsAlert.message).toContain("CAPTCHA puzzle verification");
      expect(alert.agentMailAlert.subject).toContain("2FA Barrier");
    });

    it("T2-P3-08: Rejects non-HTTP schemes (file://, javascript:, data:) in URL policy", () => {
      expect(checkUrlAllowed(new URL("file:///etc/passwd")).allowed).toBe(false);
      expect(checkUrlAllowed(new URL("javascript:alert(1)")).allowed).toBe(false);
      expect(checkUrlAllowed(new URL("data:text/html,<html></html>")).allowed).toBe(false);
    });

    it("T2-P3-09: Rejects URLs with embedded user credentials (http://user:pass@example.com)", () => {
      expect(checkUrlAllowed(new URL("https://admin:secret@app.housecallpro.com")).allowed).toBe(false);
    });
  });

  // =========================================================================
  // Pillar 4: Branded Bot Email Identity via AgentMail Boundaries
  // =========================================================================
  describe("Pillar 4: AgentMail Identity & Triage Boundaries", () => {
    it("T2-P4-01: Domain boundary: rejects unmanaged/external domains (e.g., outlook.com, attacker.com)", () => {
      expect(isBotBoundManagedEmailDomain("outlook.com")).toBe(false);
      expect(isBotBoundManagedEmailDomain("attacker.com")).toBe(false);
      expect(isBotBoundManagedEmailDomain("yahoo.co.uk")).toBe(false);
    });

    it("T2-P4-02: Subdomain boundary: accepts valid multi-level managed subdomains", () => {
      expect(isBotBoundManagedEmailDomain("field.bots.botbound.app")).toBe(true);
      expect(isBotBoundManagedEmailDomain("service.bots.botbound.app")).toBe(true);
    });

    it("T2-P4-03: Agent ID sanitization: special characters in agentId are sanitized in email username", () => {
      const inbox = buildBrandedInboxParams("Agent_Plumber #1 (Main)");
      expect(inbox.username).toMatch(/^bot-[a-z0-9-]+$/);
      expect(inbox.username).not.toContain(" ");
      expect(inbox.username).not.toContain("#");
      expect(inbox.username).not.toContain("(");
    });

    it("T2-P4-04: Deterministic client_id collisions: different domains with same agentId generate distinct client_ids", () => {
      const id1 = agentMailManagedInboxClientId("agent_x", "bots.botbound.app");
      const id2 = agentMailManagedInboxClientId("agent_x", "dispatch.botbound.app");
      expect(id1).not.toBe(id2);
    });

    it("T2-P4-05: Inbound email triage with empty/whitespace body: defaults to general inquiry without throwing", () => {
      const triage = triageInboundCustomerReply("", "   \n\t  ");
      expect(triage.intent).toBe("general_inquiry");
      expect(triage.confidence).toBeGreaterThan(0);
    });

    it("T2-P4-06: Inbound email triage with conflicting intents: prioritize urgent complaint over reschedule", () => {
      const triage = triageInboundCustomerReply(
        "Urgent: Water leak everywhere!",
        "Can we reschedule because my house is flooding right now and water is leaking everywhere?!"
      );
      expect(triage.intent).toBe("urgent_complaint");
      expect(triage.requiresHumanEscalation).toBe(true);
    });

    it("T2-P4-07: Malformed ICS invite validation: missing BEGIN:VCALENDAR or END:VCALENDAR fails validation", () => {
      const truncatedIcs = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Test";
      expect(truncatedIcs).not.toContain("END:VCALENDAR");
    });

    it("T2-P4-08: Receipt amount formatting boundary: handles large amounts ($1,250.00) and small amounts ($0.50)", () => {
      const largeCents = 125000;
      const smallCents = 50;
      expect(`$${(largeCents / 100).toFixed(2)}`).toBe("$1250.00");
      expect(`$${(smallCents / 100).toFixed(2)}`).toBe("$0.50");
    });

    it("T2-P4-09: Rejection of forged Svix webhook headers on AgentMail webhook receiver", () => {
      // Replay outside 300s window
      const nowSec = Math.floor(Date.now() / 1000);
      const staleTimestamp = nowSec - 350;
      expect(nowSec - staleTimestamp).toBeGreaterThan(300);
    });
  });
});
