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
} from "../scripts/lib/twilio-trust-hub.mjs";
import tollfreeWebhookRouter, {
  normalizeTollfreeVerificationStatus,
} from "../src/routes/twilio-tollfree-webhook";
import { drizzle } from "../src/lib/server-context";

const AUTH_TOKEN = "test-auth-token-tollfree-verification";
const ACCOUNT_SID = "AC11111111111111111111111111111111";
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
  } = {},
): Request {
  const method = options.method || "POST";
  const url = options.url || WEBHOOK_URL;
  const parsed = new URL(url);
  const accountSid = options.accountSid ?? ACCOUNT_SID;
  const requestBody = { AccountSid: accountSid, ...body };

  const signature =
    options.signature !== undefined
      ? options.signature
      : Twilio.getExpectedTwilioSignature(AUTH_TOKEN, url, requestBody);

  const headers: Record<string, string> = {
    host: parsed.host,
    "x-forwarded-host": parsed.host,
  };
  if (signature) {
    headers["x-twilio-signature"] = signature;
  }

  return {
    method,
    url: parsed.pathname,
    originalUrl: parsed.pathname,
    protocol: "https",
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

describe("Twilio Trust Hub & Toll-Free Verification Flow", () => {
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

  describe("Payload Generation & Entity Validation for EIN 43-2610447", () => {
    it("pins legal EIN 43-2610447 and corporate entity details", () => {
      expect(BOTBOUND_EIN).toBe("43-2610447");
      expect(BOTBOUND_TRUST_HUB_ENTITY.ein).toBe("43-2610447");
      expect(BOTBOUND_TRUST_HUB_ENTITY.businessName).toBe("BotBound Inc.");
      expect(BOTBOUND_TRUST_HUB_ENTITY.businessIdentityType).toBe("DIRECT_CUSTOMER");
      expect(BOTBOUND_TRUST_HUB_ENTITY.website).toBe("https://botbound.app");
      expect(BOTBOUND_TRUST_HUB_ENTITY.contactEmail).toBe("compliance@botbound.app");
      expect(BOTBOUND_TRUST_HUB_ENTITY.useCases).toEqual([
        "CUSTOMER_CARE",
        "ACCOUNT_NOTIFICATION",
      ]);
    });

    it("builds valid Trust Hub Customer Profile payload", () => {
      const payload = buildTrustHubCustomerProfilePayload();
      expect(payload.BusinessName).toBe("BotBound Inc.");
      expect(payload.BusinessRegistrationNumber).toBe("43-2610447");
      expect(payload.BusinessRegistrationType).toBe("EIN");
      expect(payload.BusinessIdentityType).toBe("DIRECT_CUSTOMER");
      expect(payload.Email).toBe("compliance@botbound.app");
      expect(payload.StatusCallback).toBe(
        "https://botbound.app/api/twilio-webhook/tollfree-verification-status",
      );
      expect(payload.Address.Country).toBe("US");
    });

    it("builds and validates complete Toll-Free verification payload", () => {
      const payload = buildTollfreeVerificationPayload({
        phoneNumber: "+18005550199",
      });

      expect(payload.BusinessName).toBe("BotBound Inc.");
      expect(payload.NotificationEmail).toBe("compliance@botbound.app");
      expect(payload.AdditionalInformation).toContain("43-2610447");
      expect(payload.ProductionMessageSample).toContain("BotBound");
      expect(payload.ProductionMessageSample.toUpperCase()).toContain("STOP");
      expect(payload.OptInImageUrls).toContain("https://botbound.app/signup");
      expect(payload.StatusCallback).toBe(
        "https://botbound.app/api/twilio-webhook/tollfree-verification-status",
      );

      const validation = validateTollfreeVerificationPayload(payload);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("validates US toll-free prefix formats accurately", () => {
      expect(isTollFreePhoneNumber("+18005550199")).toBe(true);
      expect(isTollFreePhoneNumber("+18882682686")).toBe(true);
      expect(isTollFreePhoneNumber("+18775551234")).toBe(true);
      expect(isTollFreePhoneNumber("+18665551234")).toBe(true);
      expect(isTollFreePhoneNumber("+18555551234")).toBe(true);
      expect(isTollFreePhoneNumber("+18445551234")).toBe(true);
      expect(isTollFreePhoneNumber("+18335551234")).toBe(true);

      // Rejects standard 10DLC, international, and malformed numbers
      expect(isTollFreePhoneNumber("+14155550100")).toBe(false);
      expect(isTollFreePhoneNumber("+442071838750")).toBe(false);
      expect(isTollFreePhoneNumber("18005550199")).toBe(false);
      expect(isTollFreePhoneNumber("")).toBe(false);
    });

    it("catches non-compliant Toll-Free payloads", () => {
      const invalid = buildTollfreeVerificationPayload({
        phoneNumber: "+14155550100", // Non-toll-free
      });
      invalid.ProductionMessageSample = "Welcome to our store!"; // Missing STOP
      invalid.NotificationEmail = "invalid-email";

      const validation = validateTollfreeVerificationPayload(invalid);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("NotificationEmail"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("STOP"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("not a valid US toll-free number"))).toBe(
        true,
      );
    });
  });

  describe("CLI Dry-Run Execution", () => {
    it("executes CLI --dry-run cleanly with Node 22", () => {
      const scriptPath = resolve(
        process.cwd(),
        "scripts/submit-twilio-tollfree-verification.mjs",
      );
      const output = execSync(`node "${scriptPath}" --dry-run`, {
        encoding: "utf8",
        cwd: process.cwd(),
      });

      const receipt = JSON.parse(output);
      expect(receipt.ok).toBe(true);
      expect(receipt.mode).toBe("dry-run");
      expect(receipt.ein).toBe("43-2610447");
      expect(receipt.business_name).toBe("BotBound Inc.");
      expect(receipt.validation).toBe("PASSED");
      expect(receipt.tollfree_verification.ProductionMessageSample).toContain("BotBound");
    });

    it("accepts custom toll-free phone number via CLI", () => {
      const scriptPath = resolve(
        process.cwd(),
        "scripts/submit-twilio-tollfree-verification.mjs",
      );
      const output = execSync(
        `node "${scriptPath}" --phone-number +18882682686 --dry-run`,
        {
          encoding: "utf8",
          cwd: process.cwd(),
        },
      );

      const receipt = JSON.parse(output);
      expect(receipt.ok).toBe(true);
      expect(receipt.phone_number).toBe("+18882682686");
      expect(receipt.is_toll_free).toBe(true);
    });

    it("rejects invalid non-toll-free number via CLI", () => {
      const scriptPath = resolve(
        process.cwd(),
        "scripts/submit-twilio-tollfree-verification.mjs",
      );
      let failed = false;
      try {
        execSync(`node "${scriptPath}" --phone-number +14155550100 --dry-run`, {
          encoding: "utf8",
          cwd: process.cwd(),
          stdio: "pipe",
        });
      } catch (err: unknown) {
        failed = true;
        const stderr = (err as { stderr?: string }).stderr?.toString() || "";
        expect(stderr).toContain("not a valid US toll-free number");
      }
      expect(failed).toBe(true);
    });
  });

  describe("Webhook Status Normalization", () => {
    it("maps all carrier status variations correctly", () => {
      expect(normalizeTollfreeVerificationStatus("TWILIO_APPROVED")).toEqual({
        normalized: "TWILIO_APPROVED",
        providerStatus: "approved",
      });
      expect(normalizeTollfreeVerificationStatus("approved")).toEqual({
        normalized: "TWILIO_APPROVED",
        providerStatus: "approved",
      });

      expect(normalizeTollfreeVerificationStatus("TWILIO_REJECTED")).toEqual({
        normalized: "TWILIO_REJECTED",
        providerStatus: "rejected",
      });
      expect(normalizeTollfreeVerificationStatus("rejected")).toEqual({
        normalized: "TWILIO_REJECTED",
        providerStatus: "rejected",
      });

      expect(normalizeTollfreeVerificationStatus("IN_REVIEW")).toEqual({
        normalized: "IN_REVIEW",
        providerStatus: "in_review",
      });
      expect(normalizeTollfreeVerificationStatus("under review")).toEqual({
        normalized: "IN_REVIEW",
        providerStatus: "in_review",
      });

      expect(normalizeTollfreeVerificationStatus("PENDING")).toEqual({
        normalized: "PENDING",
        providerStatus: "review_requested",
      });
    });
  });

  describe("Webhook Signature Validation & Security", () => {
    it("rejects unauthorized webhook callbacks without valid Twilio signature", async () => {
      const req = createMockReq(
        {
          VerificationSid: "HH11111111111111111111111111111111",
          Status: "TWILIO_APPROVED",
        },
        { signature: null },
      );
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(403);
      expect(res.body).toBe("Forbidden");
    });

    it("rejects requests when AccountSid does not match environment", async () => {
      const req = createMockReq(
        {
          VerificationSid: "HH11111111111111111111111111111111",
          Status: "TWILIO_APPROVED",
        },
        { accountSid: "AC99999999999999999999999999999999" },
      );
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(403);
      expect(res.body).toBe("Forbidden");
    });
  });

  describe("Webhook Status Progression & Telemetry", () => {
    it("handles TWILIO_APPROVED status callback and writes telemetry", async () => {
      vi.spyOn(drizzle, "select").mockImplementation(() =>
        chainQuery([{ userId: "user-123" }]) as never,
      );
      const insertSpy = vi
        .spyOn(drizzle, "insert")
        .mockImplementation(() => chainInsert() as never);

      const req = createMockReq({
        VerificationSid: "HH11111111111111111111111111111111",
        CustomerProfileSid: "BU22222222222222222222222222222222",
        Status: "TWILIO_APPROVED",
        PhoneNumber: "+18005550199",
      });
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        verificationSid: "HH11111111111111111111111111111111",
        status: "TWILIO_APPROVED",
        providerStatus: "approved",
      });

      expect(insertSpy).toHaveBeenCalled();
    });

    it("handles TWILIO_REJECTED with reason and logs warning audit", async () => {
      vi.spyOn(drizzle, "select").mockImplementation(() =>
        chainQuery([{ userId: "user-123" }]) as never,
      );
      const insertSpy = vi
        .spyOn(drizzle, "insert")
        .mockImplementation(() => chainInsert() as never);

      const req = createMockReq({
        VerificationSid: "HH33333333333333333333333333333333",
        CustomerProfileSid: "BU44444444444444444444444444444444",
        Status: "TWILIO_REJECTED",
        Reason: "Sample message missing opt-out keywords",
        PhoneNumber: "+18005550199",
      });
      const res = createMockRes();

      tollfreeWebhookRouter(req, res as unknown as Response, () => {});
      await res.done;

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        verificationSid: "HH33333333333333333333333333333333",
        status: "TWILIO_REJECTED",
        providerStatus: "rejected",
      });

      expect(insertSpy).toHaveBeenCalled();
    });

    it("handles IN_REVIEW and PENDING progression", async () => {
      vi.spyOn(drizzle, "select").mockImplementation(() =>
        chainQuery([{ userId: "user-123" }]) as never,
      );
      vi.spyOn(drizzle, "insert").mockImplementation(() => chainInsert() as never);

      const reqPending = createMockReq({
        VerificationSid: "HH55555555555555555555555555555555",
        Status: "PENDING",
      });
      const resPending = createMockRes();
      tollfreeWebhookRouter(reqPending, resPending as unknown as Response, () => {});
      await resPending.done;
      expect(resPending.statusCode).toBe(200);
      expect((resPending.body as { status: string }).status).toBe("PENDING");

      const reqReview = createMockReq({
        VerificationSid: "HH55555555555555555555555555555555",
        Status: "IN_REVIEW",
      });
      const resReview = createMockRes();
      tollfreeWebhookRouter(reqReview, resReview as unknown as Response, () => {});
      await resReview.done;
      expect(resReview.statusCode).toBe(200);
      expect((resReview.body as { status: string }).status).toBe("IN_REVIEW");
    });
  });
});
