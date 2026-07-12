import { Router, type NextFunction, type Response } from "express";

import { AppError } from "../lib/api-error";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import {
  normalizeTwilioMessagingServiceSid,
  normalizeTwilioPhoneSetting,
} from "../lib/twilio-settings";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

const PHONE_SETTINGS = [
  {
    snake: "twilio_sms_from_number",
    camel: "twilioSmsFromNumber",
    label: "Twilio SMS sender number",
  },
  {
    snake: "twilio_whatsapp_from_number",
    camel: "twilioWhatsappFromNumber",
    label: "Twilio WhatsApp sender number",
  },
  {
    snake: "twilio_manager_alert_number",
    camel: "twilioManagerAlertNumber",
    label: "Twilio manager alert number",
  },
  {
    snake: "handoff_phone",
    camel: "handoffPhone",
    label: "Human handoff phone number",
  },
] as const;

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function normalizeAliasedPhone(
  body: Record<string, unknown>,
  snake: string,
  camel: string,
  label: string,
): void {
  const supplied = [snake, camel].filter((key) => hasOwn(body, key));
  if (supplied.length === 0) return;

  const normalizedValues = supplied.map((key) => normalizeTwilioPhoneSetting(body[key], label));
  const normalized = normalizedValues[0];
  if (normalizedValues.some((value) => value !== normalized)) {
    throw AppError.fromHttpStatus(400, `${label} was supplied with conflicting values.`);
  }

  body[snake] = normalized;
  delete body[camel];
}

/**
 * Guard the legacy generic settings writer. These values later drive Twilio API
 * requests and the voice-fallback <Dial> target, so malformed provider input is
 * rejected before persistence rather than trusted at call time.
 */
router.use(
  "/api/settings",
  authenticateUser,
  async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (req.method !== "POST") {
      next();
      return;
    }

    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? ({ ...req.body } as Record<string, unknown>)
        : {};

    try {
      for (const setting of PHONE_SETTINGS) {
        normalizeAliasedPhone(body, setting.snake, setting.camel, setting.label);
      }

      const sidKeys = ["twilio_messaging_service_sid", "twilioMessagingServiceSid"].filter((key) =>
        hasOwn(body, key),
      );
      if (sidKeys.length > 0) {
        const normalizedValues = sidKeys.map((key) => normalizeTwilioMessagingServiceSid(body[key]));
        const normalized = normalizedValues[0];
        if (normalizedValues.some((value) => value !== normalized)) {
          throw AppError.fromHttpStatus(
            400,
            "Twilio Messaging Service SID was supplied with conflicting values.",
          );
        }
        body.twilio_messaging_service_sid = normalized;
        delete body.twilioMessagingServiceSid;
      }

      req.body = body;
      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      if (error instanceof TypeError) {
        next(AppError.fromHttpStatus(400, error.message));
        return;
      }
      log.error("Twilio settings guard failed", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      next(error);
    }
  },
);

export default router;
