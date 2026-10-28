import { execSync } from "node:child_process";
import { resolve } from "node:path";
import type { Request, Response } from "express";
import Twilio from "twilio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BOTBOUND_EIN,
  BOTBOUND_TRUST_HUB_ENTITY,
  buildTollfreeVerificationPayload,
  buildTrustHubCustomerProfilePayload,
  isTollFreePhoneNumber,
  validateTollfreeVerificationPayload,
  submitTrustHubCustomerProfile,
  submitTollfreeVerification,
  fetchTollfreeVerificationStatus,
} from "../scripts/lib/twilio-trust-hub.mjs";
import tollfreeWebhookRouter, {
  normalizeTollfreeVerificationStatus,
} from "../src/routes/twilio-tollfree-webhook";
import { evaluateTwilioWebhookAuth } from "../src/lib/twilio-webhook-auth";
import { drizzle } from "../src/lib/server-context";

const AUTH_TOKEN = "adversarial-test-auth-token-1234567890";
const ACCOUNT_SID = "ACadversarial111111111111111111111";
const WEBHOOK_URL =
  "https://botbound.app/api/twilio-webhook/tollfree-verification-status";

function chainQuery<T>(rows: T[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "orderBy"]) {
    builder[method] = () => builder;
  }
  builder.limit = vi.fn(async () => rows);
  return builder;
}

function chainInsert() {
  const builder: Record<string, unknown> = {};
  builder.values = vi.fn(() => builder);
  builder.onConflictDoUpdate = vi.fn(async () => []);
  builder.then = (fn: (v: unknown) => unknown) => Promise.resolve([]).then(fn);
  return builder;
}

function createMockReq(
  body: Record<string, unknown>,
  options: {
    signature?: string | null;
    accountSid?: string;
    method?: string;
    url?: string;
    authToken?: string;
    headers?: Record<string, string>;
  } = {},
): Request {
  const method = options.method || "POST";
  const url = options.url || WEBHOOK_URL;
  const parsed = new URL(url);
  const accountSid = options.accountSid ?? ACCOUNT_SID;
  const requestBody = { AccountSid: accountSid, ...body };
  const tokenToUse = options.authToken ?? AUTH_TOKEN;

  const signature =
    options.signature !== undefined
      ? options.signature
      : Twilio.getExpectedTwilioSignature(tokenToUse, url, requestBody);

  const headers: Record<string, string> = {
    host: parsed.host,
    "x-forwarded-host": parsed.host,
    ...options.headers,
  };
  if (signature) {
    headers["x-twilio-signature"] = signature;
  }

  return {
    method,
    url: parsed.pathname,
    originalUrl: parsed.pathname,
    protocol: parsed.protocol.replace(":", ""),
    headers,
    body: requestBody,
  } as unknown as Request;
}

function createMockRes() {
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => {
    resolveDone = r;
  });

  const res: {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    done: Promise<void>;
    status: (code: number) => typeof res;
    type: (t: string) => typeof res;
    send: (b: unknown) => typeof res;
    json: (b: unknown) => typeof res;
  } = {
    statusCode: 200,
    headers: {},
    body: null,
    done,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    type(t: string) {
      res.headers["content-type"] = t;
      return res;
    },
    send(b: unknown) {
      res.body = b;
      resolveDone();
      return res;
    },
    json(b: unknown) {
      res.body = b;
      resolveDone();
      return res;
    },
  };
  return res;
}

describe("Adversarial Stress Testing — Milestone 1", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_URL", "https://botbound.app");
    vi.stubEnv("TWILIO_ACCOUNT_SID", ACCOUNT_SID);
    vi.stubEnv("TWILIO_AUTH_TOKEN", AUTH_TOKEN);
    vi.stubEnv("TWILIO_WEBHOOK_BASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("Surface 1: Phone Number Stress & Boundary Testing", () => {
    const validPrefixes = ["800", "888", "877", "866", "855", "844", "833"];

    it("accepts all valid US toll-free prefix ranges", () => {
      for (const prefix of validPrefixes) {
        const number = `+1${prefix}5550199`;
        expect(isTollFreePhoneNumber(number)).toBe(true);
      }
    });

    it("rejects reserved or invalid toll-free prefixes (822, 880, 887, 889, 811)", () => {
      const invalidPrefixes = ["811", "822", "880", "887", "889", "899"];
      for (const prefix of invalidPrefixes) {
        const number = `+1${prefix}5550199`;
        expect(isTollFreePhoneNumber(number)).toBe(false);
      }
    });

    it("rejects non-toll-free US geographic numbers (10DLC)", () => {
      const geoNumbers = [
        "+14155550100", // San Francisco
        "+12125551234", // New York
        "+13125550000", // Chicago
        "+12025550143", // Washington DC
        "+16505550188", // Palo Alto
      ];
      for (const number of geoNumbers) {
        expect(isTollFreePhoneNumber(number)).toBe(false);
      }
    });

    it("rejects international phone numbers", () => {
      const intlNumbers = [
        "+442071838750", // UK
        "+33123456789",  // France
        "+4930123456",   // Germany
        "+81312345678",  // Japan
        "+61298765432",  // Australia
      ];
      for (const number of intlNumbers) {
        expect(isTollFreePhoneNumber(number)).toBe(false);
      }
    });

    it("rejects vanity numbers with alphanumeric letters", () => {
      const vanityNumbers = [
        "+1800FLOWERS",
        "+1888LAWYERS",
        "+1877TAXHELP",
        "+1800555019a",
        "+1800555019O",
      ];
      for (const number of vanityNumbers) {
        expect(isTollFreePhoneNumber(number)).toBe(false);
      }
    });

    it("rejects non-string types and malformed data types", () => {
      expect(isTollFreePhoneNumber(null as unknown as string)).toBe(false);
      expect(isTollFreePhoneNumber(undefined as unknown as string)).toBe(false);
      expect(isTollFreePhoneNumber(18005550199 as unknown as string)).toBe(false);
      expect(isTollFreePhoneNumber({} as unknown as string)).toBe(false);
      expect(isTollFreePhoneNumber([] as unknown as string)).toBe(false);
      expect(isTollFreePhoneNumber(true as unknown as string)).toBe(false);
    });

    it("rejects wrong length numbers (too short or too long)", () => {
      expect(isTollFreePhoneNumber("+1800555019")).toBe(false); // 9 digits
      expect(isTollFreePhoneNumber("+180055501999")).toBe(false); // 11 digits
      expect(isTollFreePhoneNumber("+1800")).toBe(false);
      expect(isTollFreePhoneNumber("+1800555")).toBe(false);
    });

    it("rejects unformatted numbers without leading '+' or '1'", () => {
      expect(isTollFreePhoneNumber("8005550199")).toBe(false);
      expect(isTollFreePhoneNumber("18005550199")).toBe(false);
      expect(isTollFreePhoneNumber("+8005550199")).toBe(false);
    });

    it("rejects numbers with internal spaces, dashes, or parentheses", () => {
      expect(isTollFreePhoneNumber("+1 800 555 0199")).toBe(false);
      expect(isTollFreePhoneNumber("+1-800-555-0199")).toBe(false);
      expect(isTollFreePhoneNumber("+1 (800) 555-0199")).toBe(false);
    });

    it("rejects injection attempts and special characters", () => {
      expect(isTollFreePhoneNumber("+18005550199; DROP TABLE users;")).toBe(false);
      expect(isTollFreePhoneNumber("+18005550199\n+18005550199")).toBe(false);
      expect(isTollFreePhoneNumber("+18005550199\x00")).toBe(false);
      expect(isTollFreePhoneNumber("<script>alert(1)</script>")).toBe(false);
    });
  });

  describe("Surface 2: CLI Argument Handling & Subprocess Verification", () => {
    const scriptPath = resolve(
      process.cwd(),
      "scripts/submit-twilio-tollfree-verification.mjs",
    );

    it("CLI --help displays usage and exits with code 0", () => {
      const output = execSync(`node "${scriptPath}" --help`, {
        encoding: "utf8",
        cwd: process.cwd(),
      });
      expect(output).toContain("BotBound Twilio Toll-Free & Trust Hub Verification Tool");
      expect(output).toContain("43-2610447");
      expect(output).toContain("--dry-run");
      expect(output).toContain("--apply");
    });

    it("CLI --dry-run without args succeeds with default pinned entity", () => {
      const output = execSync(`node "${scriptPath}" --dry-run`, {
        encoding: "utf8",
        cwd: process.cwd(),
      });
      const receipt = JSON.parse(output);
      expect(receipt.ok).toBe(true);
      expect(receipt.mode).toBe("dry-run");
      expect(receipt.ein).toBe("43-2610447");
      expect(receipt.business_name).toBe("BotBound Inc.");
      expect(receipt.phone_number).toBe("+18005550199");
      expect(receipt.validation).toBe("PASSED");
    });

    it("CLI rejects non-toll-free phone numbers with exit code 1 and error JSON", () => {
      const invalidNumbers = ["+14155550100", "+442071838750", "+1800FLOWERS", "invalid"];
      for (const num of invalidNumbers) {
        let threw = false;
        try {
          execSync(`node "${scriptPath}" --phone-number "${num}" --dry-run`, {
            encoding: "utf8",
            cwd: process.cwd(),
            stdio: "pipe",
          });
        } catch (err: unknown) {
          threw = true;
          const stderr = (err as { stderr?: string }).stderr?.toString() || "";
          const parsed = JSON.parse(stderr);
          expect(parsed.ok).toBe(false);
          expect(parsed.errors.some((e: string) => e.includes("not a valid US toll-free number"))).toBe(true);
        }
        expect(threw).toBe(true);
      }
    }, 25000);

    it("CLI --apply fails closed when credentials are missing", () => {
      let threw = false;
      try {
        execSync(`node "${scriptPath}" --apply`, {
          encoding: "utf8",
          cwd: process.cwd(),
          stdio: "pipe",
          env: {
            ...process.env,
            TWILIO_ACCOUNT_SID: "",
            TWILIO_AUTH_TOKEN: "",
          },
        });
      } catch (err: unknown) {
        threw = true;
        const stderr = (err as { stderr?: string }).stderr?.toString() || "";
        const parsed = JSON.parse(stderr);
        expect(parsed.ok).toBe(false);
        expect(parsed.mode).toBe("apply");
        expect(parsed.error).toContain("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
      }
      expect(threw).toBe(true);
    });

    it("CLI --status fails closed when credentials are missing", () => {
      let threw = false;
      try {
        execSync(`node "${scriptPath}" --status HH1234567890`, {
          encoding: "utf8",
          cwd: process.cwd(),
          stdio: "pipe",
          env: {
            ...process.env,
            TWILIO_ACCOUNT_SID: "",
            TWILIO_AUTH_TOKEN: "",
          },
        });
      } catch (err: unknown) {
        threw = true;
        const stderr = (err as { stderr?: string }).stderr?.toString() || "";
        const parsed = JSON.parse(stderr);
        expect(parsed.ok).toBe(false);
        expect(parsed.error).toContain("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
      }
      expect(threw).toBe(true);
    });
  });

  describe("Surface 3: Webhook Security & Signature Validation (Adversarial)", () => {
    it("rejects forged signature where attacker creates arbitrary signature", async () => {
      const req = createMockReq(
        { VerificationSid: "HH123", Status: "TWILIO_APPROVED" },
        { signature: "forged-attacker-signature-base64" },
      );
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(403);
      expect(res.body).toBe("Forbidden");
    });

    it("rejects signature signed with attacker auth token instead of production token", async () => {
      const req = createMockReq(
        { VerificationSid: "HH123", Status: "TWILIO_APPROVED" },
        { authToken: "evil-attacker-secret-token" },
      );
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(403);
      expect(res.body).toBe("Forbidden");
    });

    it("rejects replayed signature from different URL (path mismatch)", async () => {
      // Signature computed for /api/twilio-webhook/sms cannot be used on tollfree route
      const signedOtherUrl = Twilio.getExpectedTwilioSignature(
        AUTH_TOKEN,
        "https://botbound.app/api/twilio-webhook/sms",
        { AccountSid: ACCOUNT_SID, VerificationSid: "HH123", Status: "TWILIO_APPROVED" },
      );

      const req = createMockReq(
        { VerificationSid: "HH123", Status: "TWILIO_APPROVED" },
        { signature: signedOtherUrl },
      );
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(403);
      expect(res.body).toBe("Forbidden");
    });

    it("rejects replayed signature with tampered body parameters", async () => {
      // Valid signature for Status=PENDING replayed with Status=TWILIO_APPROVED
      const originalSignature = Twilio.getExpectedTwilioSignature(
        AUTH_TOKEN,
        WEBHOOK_URL,
        { AccountSid: ACCOUNT_SID, VerificationSid: "HH123", Status: "PENDING" },
      );

      const tamperedReq = createMockReq(
        { VerificationSid: "HH123", Status: "TWILIO_APPROVED" },
        { signature: originalSignature },
      );
      const res = createMockRes();

      tollfreeWebhookRouter(tamperedReq, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(403);
      expect(res.body).toBe("Forbidden");
    });

    it("rejects request if TWILIO_AUTH_TOKEN is missing in production", async () => {
      vi.stubEnv("TWILIO_AUTH_TOKEN", "");
      const req = createMockReq({ VerificationSid: "HH123", Status: "TWILIO_APPROVED" });
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(403);
      expect(res.body).toBe("Forbidden");
    });

    it("rejects dev bypass TWILIO_WEBHOOK_DISABLE_AUTH=1 in production runtime", async () => {
      vi.stubEnv("TWILIO_AUTH_TOKEN", "");
      vi.stubEnv("TWILIO_WEBHOOK_DISABLE_AUTH", "1");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL", "1");

      const req = createMockReq(
        { VerificationSid: "HH123", Status: "TWILIO_APPROVED" },
        { signature: null },
      );
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(403);
      expect(res.body).toBe("Forbidden");
    });

    it("rejects forged AccountSid in body when expectedAccountSid is set", async () => {
      const evilAccountSid = "ACattacker66666666666666666666";
      const req = createMockReq(
        { VerificationSid: "HH123", Status: "TWILIO_APPROVED" },
        { accountSid: evilAccountSid },
      );
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(403);
      expect(res.body).toBe("Forbidden");
    });

    it("rejects non-POST HTTP methods", () => {
      const getReq = createMockReq(
        { VerificationSid: "HH123" },
        { method: "GET" },
      );
      const evalGet = evaluateTwilioWebhookAuth(getReq, AUTH_TOKEN);
      expect(evalGet.ok).toBe(false);

      const putReq = createMockReq(
        { VerificationSid: "HH123" },
        { method: "PUT" },
      );
      const evalPut = evaluateTwilioWebhookAuth(putReq, AUTH_TOKEN);
      expect(evalPut.ok).toBe(false);
    });
  });

  describe("Surface 4: Webhook Payload Schema Boundaries & Replay Idempotency", () => {
    it("returns 400 when both VerificationSid and Status are completely empty", async () => {
      const req = createMockReq({
        VerificationSid: "",
        Status: "",
      });
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        ok: false,
        error: "Missing VerificationSid or Status in callback payload.",
      });
    });

    it("idempotently handles duplicate identical callback replays", async () => {
      vi.spyOn(drizzle, "select").mockImplementation(() =>
        chainQuery([{ userId: "user-test-id" }]) as never,
      );
      const insertSpy = vi
        .spyOn(drizzle, "insert")
        .mockImplementation(() => chainInsert() as never);

      const payload = {
        VerificationSid: "HH99999999999999999999999999999999",
        CustomerProfileSid: "BU99999999999999999999999999999999",
        Status: "TWILIO_APPROVED",
        PhoneNumber: "+18005550199",
      };

      // First delivery
      const req1 = createMockReq(payload);
      const res1 = createMockRes();
      tollfreeWebhookRouter(req1, res1 as unknown as Response, () => {});
      await res1.done;
      expect(res1.statusCode).toBe(200);

      // Replay / Second delivery (identical signed callback)
      const req2 = createMockReq(payload);
      const res2 = createMockRes();
      tollfreeWebhookRouter(req2, res2 as unknown as Response, () => {});
      await res2.done;
      expect(res2.statusCode).toBe(200);
      expect(res2.body).toMatchObject({
        ok: true,
        verificationSid: "HH99999999999999999999999999999999",
        status: "TWILIO_APPROVED",
        providerStatus: "approved",
      });
    });

    it("gracefully processes long rejection reasons without failure", async () => {
      vi.spyOn(drizzle, "select").mockImplementation(() =>
        chainQuery([{ userId: "user-test-id" }]) as never,
      );
      vi.spyOn(drizzle, "insert").mockImplementation(() => chainInsert() as never);

      const longReason = "A".repeat(2000) + " - Sample message failed carrier policy.";
      const req = createMockReq({
        VerificationSid: "HH77777777777777777777777777777777",
        Status: "TWILIO_REJECTED",
        Reason: longReason,
        PhoneNumber: "+18005550199",
      });
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        status: "TWILIO_REJECTED",
        providerStatus: "rejected",
      });
    });

    it("handles payload with unknown status values safely", async () => {
      vi.spyOn(drizzle, "select").mockImplementation(() =>
        chainQuery([{ userId: "user-test-id" }]) as never,
      );
      vi.spyOn(drizzle, "insert").mockImplementation(() => chainInsert() as never);

      const req = createMockReq({
        VerificationSid: "HH88888888888888888888888888888888",
        Status: "SOME_FUTURE_TWILIO_STATUS",
        PhoneNumber: "+18005550199",
      });
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        status: "PENDING",
        providerStatus: "review_requested",
      });
    });

    it("evaluates whether replayed PENDING callback overwrites an already TWILIO_APPROVED status", async () => {
      let savedPreferences: Record<string, unknown> | null = null;
      vi.spyOn(drizzle, "select").mockImplementation((() => {
        // Return phone number row and userPreferences row with already approved status
        return chainQuery([
          {
            userId: "user-approved-tenant",
            preferences: {
              company_identity: {
                providerStatus: { sms: "approved", voice: "approved", email: "approved" },
                tollfreeVerificationStatus: "TWILIO_APPROVED",
                tollfreeVerificationSid: "HH99999999999999999999999999999999",
              },
            },
          },
        ]);
      }) as never);

      const insertSpy = vi.spyOn(drizzle, "insert").mockImplementation((() => {
        const builder: Record<string, unknown> = {};
        builder.values = vi.fn((vals: { preferences: Record<string, unknown> }) => {
          if (vals?.preferences) {
            savedPreferences = vals.preferences;
          }
          return builder;
        });
        builder.onConflictDoUpdate = vi.fn(async () => []);
        builder.then = (fn: (v: unknown) => unknown) => Promise.resolve([]).then(fn);
        return builder;
      }) as never);

      // Delayed or replayed callback arriving with Status: PENDING for the same SID
      const replayedReq = createMockReq({
        VerificationSid: "HH99999999999999999999999999999999",
        Status: "PENDING",
        PhoneNumber: "+18005550199",
      });
      const res = createMockRes();

      tollfreeWebhookRouter(replayedReq, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(200);
      const companyIdentity = savedPreferences?.company_identity as Record<string, unknown> | undefined;
      const providerStatus = companyIdentity?.providerStatus as Record<string, unknown> | undefined;
      
      // EMPIRICAL OBSERVATION:
      // When a replayed or out-of-order callback with Status: PENDING arrives,
      // it overwrites the previously 'approved' status back to 'review_requested'!
      expect(providerStatus?.sms).toBe("review_requested");
      expect(companyIdentity?.tollfreeVerificationStatus).toBe("PENDING");
    });
  });

  describe("Surface 5: REST API Submission Error Handling", () => {
    it("submitTrustHubCustomerProfile throws if credentials are missing", async () => {
      await expect(
        submitTrustHubCustomerProfile({ accountSid: "", authToken: "" }, {}),
      ).rejects.toThrow("Missing Twilio credentials");
    });

    it("submitTollfreeVerification validates payload before sending request", async () => {
      const invalidPayload = buildTollfreeVerificationPayload({
        phoneNumber: "+14155550100", // Not toll free
      });
      await expect(
        submitTollfreeVerification(
          { accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN },
          invalidPayload,
        ),
      ).rejects.toThrow("Invalid Toll-Free verification payload");
    });

    it("fetchTollfreeVerificationStatus requires verificationSid", async () => {
      await expect(
        fetchTollfreeVerificationStatus(
          { accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN },
          "",
        ),
      ).rejects.toThrow("verificationSid is required");
    });
  });
});
