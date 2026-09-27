import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { liveExternalActionPolicyForUser } from "../lib/account-environment-policy";
import { asyncHandler } from "../lib/api-error";
import { getTenantChannelEntitlements } from "../lib/channel-entitlements";
import { drizzle, log } from "../lib/server-context";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import { phoneSuffixForLog } from "../lib/twilio-webhook-privacy";
import { issueOpenAIInboundToken } from "../lib/voice/openai-inbound-token";
import {
  buildOpenAIInboundSipUri,
  normalizeOpenAIPhoneNumber,
  openAISipConfigured,
  resolveOpenAISipSessionMaxSeconds,
} from "../lib/voice/openai-sip-config";
import { handleTwilioVoiceFallback } from "./twilio-webhook-base";

const router = Router();
const INBOUND_DIAL_CONTINUITY_STATUSES = new Set(["failed", "busy", "no-answer"]);

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
    `<Response><Dial answerOnBridge="true" action="/api/twilio-webhook/openai-inbound-dial-complete" method="POST" timeLimit="${resolveOpenAISipSessionMaxSeconds()}">` +
    `<Sip>${escapeXml(sipUri)}</Sip></Dial><Hangup/></Response>`
  );
}

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
    if (!calledNumber) {
      log.warn("Twilio inbound OpenAI bridge refused before routing", {
        calledSuffix: "",
        reason: "invalid_called_number",
      });
      res.status(200).send(hangupTwiml());
      return;
    }
    if (!openAISipConfigured()) {
      log.error("Twilio inbound OpenAI bridge is temporarily unavailable", {
        calledSuffix: phoneSuffixForLog(calledNumber),
        reason: "openai_not_configured",
      });
      // Twilio invokes the IncomingPhoneNumber fallback URL only when the
      // primary webhook is unavailable, not after a successful Hangup response.
      res.status(503).send(hangupTwiml());
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

      const entitlement = await getTenantChannelEntitlements(userId);
      if (!entitlement.channels.includes("voice")) {
        res.status(200).send(hangupTwiml());
        return;
      }

      const { token } = issueOpenAIInboundToken({
        twilioCallSid: String(req.body?.CallSid || ""),
        calledNumber,
        callerNumber,
      });
      const sipUri = buildOpenAIInboundSipUri(token);
      res.status(200).send(inboundBridgeTwiml(sipUri));
    } catch (error) {
      log.error("Twilio inbound OpenAI bridge failed closed", {
        calledSuffix: phoneSuffixForLog(calledNumber),
        errorClass: error instanceof Error ? error.name : typeof error,
      });
      // Lookup/configuration exceptions are transient primary-route failures.
      // Returning success here would suppress the carrier continuity callback.
      res.status(503).send(hangupTwiml());
    }
  }),
);

router.post(
  "/api/twilio-webhook/openai-inbound-dial-complete",
  async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/xml");
    if (!evaluateTwilioWebhookAuth(req).ok) {
      res.status(403).send(hangupTwiml());
      return;
    }

    const dialStatus =
      typeof req.body?.DialCallStatus === "string"
        ? req.body.DialCallStatus.trim().toLowerCase()
        : "unknown";
    if (dialStatus === "completed") {
      res.status(200).send(hangupTwiml());
      return;
    }
    if (INBOUND_DIAL_CONTINUITY_STATUSES.has(dialStatus)) {
      await handleTwilioVoiceFallback(req, res);
      return;
    }

    log.warn("Twilio inbound OpenAI Dial returned an unhandled status", { dialStatus });
    res.status(200).send(hangupTwiml());
  },
);

router.post("/api/twilio-webhook/openai-inbound-fallback", handleTwilioVoiceFallback);

export default router;
