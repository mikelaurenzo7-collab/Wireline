import { Router, type Request } from "express";
import { z } from "zod";
import { AppError, asyncHandler } from "../lib/api-error";
import { validateBody } from "../lib/api-validation";
import {
  createPhoneTest,
  endPhoneTest,
  getPhoneTest,
  handlePhoneTestAnswer,
  handlePhoneTestStatus,
  phoneTestHangupTwiml,
  normalizePhoneTestCarrierErrorCode,
  type PhoneTestCarrierInput,
} from "../lib/voice/phone-test";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const startBody = z
  .object({
    phone: z.string().trim().min(10).max(30),
    request_key: z.string().uuid(),
    consent: z.literal(true),
  })
  .strict();
const limiter = createRateLimiter({
  bucket: "phone-test:create",
  windowMs: 60_000,
  max: 3,
  failClosedOnError: true,
});
router.post(
  "/api/agents/:agentId/phone-test",
  authenticateUser,
  limiter,
  validateBody(startBody),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    res.setHeader("Cache-Control", "no-store");
    const test = await createPhoneTest({
      userId: user.id,
      agentId: req.params.agentId,
      phone: req.body.phone,
      requestKey: req.body.request_key,
    });
    res.json({ test });
  }),
);
router.get(
  "/api/agents/:agentId/phone-test/:requestKey",
  authenticateUser,
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      test: await getPhoneTest(
        (req as AuthenticatedRequest).user.id,
        req.params.agentId,
        req.params.requestKey.toLowerCase(),
      ),
    });
  }),
);
router.delete(
  "/api/agents/:agentId/phone-test/:requestKey",
  authenticateUser,
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      test: await endPhoneTest(
        (req as AuthenticatedRequest).user.id,
        req.params.agentId,
        req.params.requestKey.toLowerCase(),
      ),
    });
  }),
);
function carrierInput(req: Request): PhoneTestCarrierInput {
  if (!evaluateTwilioWebhookAuth(req).ok) throw AppError.unauthorized("Invalid carrier signature.");
  return {
    token: typeof req.query.token === "string" ? req.query.token : "",
    callSid: typeof req.body?.CallSid === "string" ? req.body.CallSid : "",
    to: typeof req.body?.To === "string" ? req.body.To : "",
    from: typeof req.body?.From === "string" ? req.body.From : "",
    status: typeof req.body?.CallStatus === "string" ? req.body.CallStatus : "",
    duration: typeof req.body?.CallDuration === "string" ? req.body.CallDuration : undefined,
    digits: typeof req.body?.Digits === "string" ? req.body.Digits : undefined,
    attempt: req.query.attempt === "1" ? 1 : req.query.attempt === "2" ? 2 : undefined,
    errorCode: normalizePhoneTestCarrierErrorCode(req.body?.ErrorCode),
  };
}
function phoneTestTwimlHandler(kind: "answer" | "gather" | "fallback") {
  return asyncHandler(async (req, res) => {
    const input = carrierInput(req);
    res.setHeader("Cache-Control", "no-store");
    // A fallback never reaches AI or retries the dial. The independently signed
    // status callback and deadline job own authoritative parent settlement.
    const twiml =
      kind === "fallback"
        ? phoneTestHangupTwiml()
        : await handlePhoneTestAnswer(input, kind === "gather");
    res.type("text/xml").send(twiml);
  });
}
router.post("/api/twilio-webhook/phone-test/answer", phoneTestTwimlHandler("answer"));
router.post("/api/twilio-webhook/phone-test/gather", phoneTestTwimlHandler("gather"));
router.post("/api/twilio-webhook/phone-test/fallback", phoneTestTwimlHandler("fallback"));
router.post(
  "/api/twilio-webhook/phone-test/status",
  asyncHandler(async (req, res) => {
    await handlePhoneTestStatus(carrierInput(req));
    res.status(204).end();
  }),
);
export default router;
