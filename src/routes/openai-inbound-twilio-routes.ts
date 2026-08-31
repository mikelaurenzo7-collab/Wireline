import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { liveExternalActionPolicyForUser } from "../lib/account-environment-policy";
import { asyncHandler } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import { phoneSuffixForLog } from "../lib/twilio-webhook-privacy";
import {
  buildOpenAIInboundSipUri,
  normalizeOpenAIPhoneNumber,
  openAISipConfigured,
  resolveOpenAISipSessionMaxSeconds,
} from "../lib/voice/openai-sip-config";

const router = Router();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hangupTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
}

function inboundBridgeTwiml(sipUri: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<Response><Dial answerOnBridge="true" timeLimit="${resolveOpenAISipSessionMaxSeconds()}">` +
    `<Sip>${escapeXml(sipUri)}</Sip></Dial><Hangup/></Response>`
  );
}

/**
 * Only a current tenant-owned phone-number row with an assigned Bot may bridge
 * into OpenAI. Founder showcase numbers are intentionally not special-cased:
 * retiring their database assignments therefore fails closed even if a stale
 * carrier webhook still points at this endpoint.
 */
async function resolveInboundOwner(phoneNumber: string): Promise<string | null> {
  const [line] = await drizzle
    .select({ userId: schema.phoneNumbers.userId, agentId: schema.phoneNumbers.agentId })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.phoneNumber, phoneNumber))
    .limit(1);
  return line?.userId && line.agentId ? line.userId : null;
}

router.post(
  "/api/twilio-webhook/openai-inbound",
  asyncHandler(async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/xml");
    if (!evaluateTwilioWebhookAuth(req).ok) {
      res.status(403).send(hangupTwiml());
      return;
    }

    const calledNumber = normalizeOpenAIPhoneNumber(req.body?.To);
    const callerNumber = normalizeOpenAIPhoneNumber(req.body?.From);
    if (!calledNumber || !openAISipConfigured()) {
      log.warn("Twilio inbound OpenAI bridge refused before routing", {
        calledSuffix: phoneSuffixForLog(calledNumber ?? ""),
        reason: calledNumber ? "openai_not_configured" : "invalid_called_number",
      });
      res.status(200).send(hangupTwiml());
      return;
    }

    try {
      const userId = await resolveInboundOwner(calledNumber);
      if (!userId) {
        log.warn("Twilio inbound OpenAI bridge found no assigned BotBound line", {
          calledSuffix: phoneSuffixForLog(calledNumber),
        });
        res.status(200).send(hangupTwiml());
        return;
      }
      const environment = await liveExternalActionPolicyForUser(userId);
      if (!environment.allowed) {
        log.warn("Twilio inbound OpenAI bridge blocked by workspace environment", {
          userId,
          calledSuffix: phoneSuffixForLog(calledNumber),
          accountEnvironment: environment.environment ?? "missing",
        });
        res.status(200).send(hangupTwiml());
        return;
      }

      const sipUri = buildOpenAIInboundSipUri(calledNumber, callerNumber);
      res.status(200).send(inboundBridgeTwiml(sipUri));
    } catch (error) {
      log.error("Twilio inbound OpenAI bridge failed closed", {
        calledSuffix: phoneSuffixForLog(calledNumber),
        errorClass: error instanceof Error ? error.name : typeof error,
      });
      res.status(200).send(hangupTwiml());
    }
  }),
);

router.post("/api/twilio-webhook/openai-inbound-fallback", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/xml");
  if (!evaluateTwilioWebhookAuth(req).ok) {
    return res.status(403).send(hangupTwiml());
  }
  return res.status(200).send(hangupTwiml());
});

export default router;
