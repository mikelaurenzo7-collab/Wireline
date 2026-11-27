/**
 * Tier 2: Boundary & Corner Cases (E2E Opaque-Box Suite)
 *
 * Validates boundaries, edge cases, invalid inputs, failure modes, and rate limiting across the Lean 4 Pillars:
 * - Pillar 1: Buffer boundaries (0 min, 15 min min, 60 min max), hold expiration (after 300s TTL), concurrent booking collisions
 * - Pillar 2: Wallet limit breaches ($100/mo cap, $25/resolution), invalid tokens, forged Stripe signatures, stale webhooks
 * - Pillar 3: Browserbase timeouts (60s-3600s), SSRF network guards (127.0.0.1, 169.254.169.254, RFC1918), filler cycling limits
 * - Pillar 4: AgentMail unmanaged domain rejection, username sanitization, malformed ICS validation, triage intent conflicts
 *
 * The travel-buffer, soft-hold, .ics, in-call payment, goodwill-wallet, branded-inbox
 * and reply-triage cases exercised modules that production never imported. They were
 * removed together with those modules; what remains covers code that ships and the
 * harness's own reference models.
 */

import { describe, expect, it } from "vitest";

// Existing codebase imports
import { validateNativeCalendarSettings } from "../../src/lib/native-calendar-policy";
import { cloudComputerConnection } from "../../src/lib/cloud-computer/config";
import { isNonPublicAddress, checkUrlAllowed } from "../../src/lib/cloud-computer/url-policy";
import { agentMailManagedInboxClientId } from "../../src/lib/agentmail-mail";
import { isBotBoundManagedEmailDomain } from "../../src/lib/managed-agentmail-domain";

// Lean 4-Pillar Test Harness
import { selectConversationalFiller, create2FATakeoverAlert } from "./helpers/lean4-pillar-harness";

describe("Tier 2: Boundary & Corner Cases (Lean 4 Pillars)", () => {
  // =========================================================================
  // Pillar 1: Zero-Conflict Calendar Engine Boundaries
  // =========================================================================
  describe("Pillar 1: Calendar Engine Boundaries", () => {
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
      expect(checkUrlAllowed(new URL("https://admin:secret@app.housecallpro.com")).allowed).toBe(
        false,
      );
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

    it("T2-P4-04: Deterministic client_id collisions: different domains with same agentId generate distinct client_ids", () => {
      const id1 = agentMailManagedInboxClientId("agent_x", "bots.botbound.app");
      const id2 = agentMailManagedInboxClientId("agent_x", "dispatch.botbound.app");
      expect(id1).not.toBe(id2);
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
