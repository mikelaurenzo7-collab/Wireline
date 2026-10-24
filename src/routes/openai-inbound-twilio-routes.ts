import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { liveExternalActionPolicyForUser } from "../lib/account-environment-policy";
import { asyncHandler } from "../lib/api-error";
import { getTenantChannelEntitlements } from "../lib/channel-entitlements";
import { drizzle, log } from "../lib/server-context";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import { phoneSuffixForLog } from "../lib/twilio-webhook-privacy";
import { issueOpenAIInboundToken } from "../lib/voice/openai-inbound-token";
import { normalizeOpenAIPhoneNumber, openAISipConfigured } from "../lib/voice/openai-sip-config";
import { configuredPhoneVoiceProvider } from "../lib/voice/realtime-provider";
import { resolveInboundSipTarget } from "../lib/voice/realtime-sip-target";
import { xaiSipConfigured } from "../lib/voice/xai-sip-config";
import {
  hangupTwiml,
  inboundBridgeTwiml,
  INBOUND_SIP_REFER_PATH,
  openAIFailoverTwiml,
  referTransferTwiml,
} from "../lib/voice/inbound-bridge";
import { consumeFallbackDrill } from "../lib/voice/fallback-drill";
import { clonedCallTwiml } from "../lib/voice/cloned-call-routing";
import { handleTwilioVoiceFallback } from "./twilio-webhook-base";

const router = Router();
const INBOUND_DIAL_CONTINUITY_STATUSES = new Set(["failed", "busy", "no-answer"]);

/** Either live voice provider can answer; xAI needs its own configuration. */
function phoneVoiceRuntimeConfigured(): boolean {
  return openAISipConfigured() || (configuredPhoneVoiceProvider() === "xai" && xaiSipConfigured());
}

async function resolveInboundOwner(
  phoneNumber: string,
): Promise<{ userId: string; agentId: string } | null> {
  const [line] = await drizzle
    .select({
      userId: schema.phoneNumbers.userId,
      agentId: schema.phoneNumbers.agentId,
    })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.phoneNumber, phoneNumber))
    .limit(1);
  return line?.userId && line.agentId ? { userId: line.userId, agentId: line.agentId } : null;
}

async function inboundCallRecordingEnabled(owner: {
  userId: string;
  agentId: string;
}): Promise<boolean> {
  const [agent] = await drizzle
    .select({ callRecordingEnabled: schema.agents.callRecordingEnabled })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, owner.agentId), eq(schema.agents.userId, owner.userId)))
    .limit(1);
  return agent?.callRecordingEnabled ?? false;
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
    if (!phoneVoiceRuntimeConfigured()) {
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
      const owner = await resolveInboundOwner(calledNumber);
      const userId = owner?.userId ?? null;
      if (!owner || !userId) {
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

      // Decide recording once, here, and reuse the same immutable value for
      // both carrier capture (the <Dial> below) and the spoken notice (the SIP
      // token is checked at admission). Toggling the Bot flag after this
      // response cannot make capture and disclosure disagree.
      const callRecordingEnabled = await inboundCallRecordingEnabled(owner);
      const twilioCallSid = String(req.body?.CallSid || "");
      // A platform admin can arm one fallback drill per number (never an env
      // change). It only ever exercises the same path a real outage takes.
      const drill = await consumeFallbackDrill({
        ...owner,
        phoneNumber: calledNumber,
      });
      const { token } = issueOpenAIInboundToken({
        twilioCallSid,
        calledNumber,
        callerNumber,
        callRecordingEnabled,
        ...(drill && drill !== "xai_connect" ? { drill } : {}),
      });
      const clonedTwiml = !drill
        ? await clonedCallTwiml({ ...owner, token, direction: "inbound" })
        : null;
      if (clonedTwiml) {
        res.status(200).send(clonedTwiml);
        return;
      }
      const target = await resolveInboundSipTarget({ calledNumber, token });
      if (drill === "xai_connect" && target.provider === "xai") {
        // Simulate xAI never answering: skip straight to the dial-complete
        // failover, exactly as a failed xAI <Dial> would.
        log.warn("Fallback drill: skipping the xAI leg for this call", {
          calledSuffix: phoneSuffixForLog(calledNumber),
        });
        const failover = openAIFailoverTwiml({
          twilioCallSid,
          calledNumber,
          callerNumber,
          callRecordingEnabled,
          leg: "failover",
        });
        if (failover) {
          res.status(200).send(failover);
          return;
        }
      }
      res.status(200).send(inboundBridgeTwiml(target, callRecordingEnabled));
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

function xaiConnectFailoverTwiml(req: Request): string | null {
  const calledNumber = normalizeOpenAIPhoneNumber(req.body?.To);
  const callerNumber = normalizeOpenAIPhoneNumber(req.body?.From);
  const twilioCallSid = String(req.body?.CallSid || "");
  if (!calledNumber || !openAISipConfigured()) return null;
  try {
    // The action URL is part of Twilio's signed request, so `rec` is the
    // recording decision this response originally made, not caller input.
    return openAIFailoverTwiml({
      twilioCallSid,
      calledNumber,
      callerNumber,
      callRecordingEnabled: req.query?.rec === "1",
      leg: "failover",
    });
  } catch (error) {
    log.error("xAI connect failover could not be prepared", {
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

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
    if (INBOUND_DIAL_CONTINUITY_STATUSES.has(dialStatus) && req.query?.leg === "xai") {
      // xAI did not connect within its short timeout. Answer the same caller
      // on OpenAI Realtime before any human or missed-call fallback.
      const failover = xaiConnectFailoverTwiml(req);
      if (failover) {
        log.warn("xAI voice did not connect; answering on OpenAI", {
          dialStatus,
        });
        res.status(200).send(failover);
        return;
      }
    }
    if (INBOUND_DIAL_CONTINUITY_STATUSES.has(dialStatus)) {
      await handleTwilioVoiceFallback(req, res);
      return;
    }

    log.warn("Twilio inbound OpenAI Dial returned an unhandled status", {
      dialStatus,
    });
    res.status(200).send(hangupTwiml());
  },
);

router.post(INBOUND_SIP_REFER_PATH, async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/xml");
  if (!evaluateTwilioWebhookAuth(req).ok) {
    res.status(403).send(hangupTwiml());
    return;
  }
  // BotBound only REFERs after its own transfer checks (tenant, funding,
  // inbound source), and the request is Twilio-signed, so the target here is
  // the destination BotBound chose. Only a PSTN number is dialed.
  const twiml = referTransferTwiml(
    req.body?.ReferTransferTarget,
    normalizeOpenAIPhoneNumber(req.body?.To) || null,
  );
  if (!twiml) {
    log.warn("SIP REFER target was not a phone number; using the voice fallback");
    await handleTwilioVoiceFallback(req, res);
    return;
  }
  log.info("SIP REFER transfer to a person", {
    to_suffix: phoneSuffixForLog(String(req.body?.To || "")),
  });
  res.status(200).send(twiml);
});

router.post("/api/twilio-webhook/openai-inbound-fallback", handleTwilioVoiceFallback);

export default router;
