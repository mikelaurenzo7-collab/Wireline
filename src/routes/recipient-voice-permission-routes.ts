import { Router } from "express";
import { z } from "zod";
import { authenticateUser } from "../middleware/auth";
import { createIpRateLimiter, createRateLimiter } from "../middleware/api-rate-limits";
import { validate } from "../middleware/input-validation";
import { getCanonicalAppUrl } from "../lib/app-url";
import { AppError } from "../lib/api-error";
import { OUTBOUND_CALL_PURPOSES } from "../lib/outbound-call-purpose";
import { outboundCallingAvailability } from "../lib/outbound-call-purpose";
import { isRecipientCallingTimeZone, isUsCallingState } from "../lib/us-calling-jurisdiction";
import {
  createRecipientVoicePermission,
  grantRecipientVoicePermission,
  listRecipientVoicePermissions,
  previewRecipientVoicePermission,
  recipientVoicePermissionLink,
  revokePublicRecipientVoicePermission,
  revokeRecipientVoicePermission,
} from "../lib/recipient-voice-permission-store";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const ownerLimit = createRateLimiter({
  bucket: "voice-permission-owner",
  windowMs: 60_000,
  max: 20,
  failClosedOnError: true,
});
const recipientLimit = createIpRateLimiter({
  bucket: "voice-permission-recipient",
  windowMs: 60_000,
  max: 30,
  failClosedOnError: true,
});
const tokenBody = z.object({ token: z.string().min(1).max(100) }).strict();
const callingJurisdiction = {
  recipient_state: z
    .string()
    .refine(isUsCallingState, "Choose a US state or the District of Columbia."),
  recipient_time_zone: z.string().min(1).max(64),
};
const createBody = z
  .object({
    request_key: z.string().uuid(),
    agent_id: z.string().min(1).max(200),
    phone: z.string().min(7).max(30),
    call_purpose: z.enum(OUTBOUND_CALL_PURPOSES),
    ...callingJurisdiction,
  })
  .strict()
  .refine((body) => isRecipientCallingTimeZone(body.recipient_state, body.recipient_time_zone), {
    message: "Choose a time zone used by the recipient's state.",
    path: ["recipient_time_zone"],
  });
const grantBody = tokenBody
  .extend({
    signer_name: z.string().trim().min(2).max(120),
    phone: z.string().min(7).max(30),
    accepted: z.literal(true),
    disclosure_hash: z.string().regex(/^[a-f0-9]{64}$/),
    ...callingJurisdiction,
  })
  .strict()
  .refine((body) => isRecipientCallingTimeZone(body.recipient_state, body.recipient_time_zone), {
    message: "Choose a time zone used by the recipient's state.",
    path: ["recipient_time_zone"],
  });
function captureOrigin(): string {
  try {
    const configured = getCanonicalAppUrl();
    const url = new URL(configured);
    const localHttp =
      url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.origin !== configured ||
      url.username ||
      url.password ||
      (url.protocol !== "https:" && !localHttp)
    )
      throw new Error("Invalid configured app origin");
    return url.origin;
  } catch {
    throw AppError.serviceUnavailable(
      "Permission links are unavailable until the application origin is configured correctly.",
    );
  }
}

const link = (origin: string, token: string) =>
  `${origin}/voice-permission#token=${encodeURIComponent(token)}`;

router.get("/voice-permission", (_req, res, next) => {
  res.set({
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  });
  next();
});

router.use("/api/voice-permissions", (_req, res, next) => {
  res.set({
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  });
  next();
});

router.post(
  "/api/voice-permissions/recipient/preview",
  recipientLimit,
  validate({ body: tokenBody }),
  async (req, res) => {
    res.json(await previewRecipientVoicePermission(req.body.token));
  },
);

router.post(
  "/api/voice-permissions/recipient/confirm",
  recipientLimit,
  validate({ body: grantBody }),
  async (req, res) => {
    res.json(
      await grantRecipientVoicePermission({
        token: req.body.token,
        signerName: req.body.signer_name,
        phone: req.body.phone,
        accepted: req.body.accepted,
        disclosureHash: req.body.disclosure_hash,
        recipientState: req.body.recipient_state,
        timeZone: req.body.recipient_time_zone,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      }),
    );
  },
);

router.post(
  "/api/voice-permissions/recipient/revoke",
  recipientLimit,
  validate({ body: tokenBody }),
  async (req, res) => {
    res.json({ permission: await revokePublicRecipientVoicePermission(req.body.token) });
  },
);

router.get(
  "/api/voice-permissions",
  authenticateUser,
  ownerLimit,
  async (req: AuthenticatedRequest, res) => {
    res.json({
      permissions: await listRecipientVoicePermissions(req.user.id),
      calling: outboundCallingAvailability(),
    });
  },
);

router.post(
  "/api/voice-permissions",
  authenticateUser,
  ownerLimit,
  validate({ body: createBody }),
  async (req: AuthenticatedRequest, res) => {
    const origin = captureOrigin();
    const result = await createRecipientVoicePermission({
      userId: req.user.id,
      requestKey: req.body.request_key,
      agentId: req.body.agent_id,
      phone: req.body.phone,
      callPurpose: req.body.call_purpose,
      recipientState: req.body.recipient_state,
      timeZone: req.body.recipient_time_zone,
    });
    res.json({ permission: result.permission, capture_url: link(origin, result.token) });
  },
);

router.post(
  "/api/voice-permissions/:id/link",
  authenticateUser,
  ownerLimit,
  async (req: AuthenticatedRequest, res) => {
    const origin = captureOrigin();
    res.json({
      capture_url: link(origin, await recipientVoicePermissionLink(req.user.id, req.params.id)),
    });
  },
);

router.post(
  "/api/voice-permissions/:id/revoke",
  authenticateUser,
  ownerLimit,
  async (req: AuthenticatedRequest, res) => {
    res.json({
      permission: await revokeRecipientVoicePermission({
        userId: req.user.id,
        artifactId: req.params.id,
      }),
    });
  },
);

export default router;
