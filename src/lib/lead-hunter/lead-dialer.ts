import type { DiscoveredLead, LeadDialRequest } from "./types";
import { AppError } from "../api-error";

export interface OutboundDossier {
  leadId: string;
  businessName: string;
  phoneNumber: string;
  promptSystemPromptAddition: string;
  suggestedOpeningHook: string;
}

/**
 * Generates contextual briefing for the Gemini Live voice agent before dialing
 */
export function buildLeadDossier(lead: DiscoveredLead): OutboundDossier {
  const ratingText = lead.rating ? `rated ${lead.rating} stars with ${lead.reviewCount || 0} reviews` : "local business";
  const addressText = lead.address ? `located at ${lead.address}` : "in your local area";

  const suggestedOpeningHook =
    `Hi, I'm calling from BotBound for ${lead.businessName}. I saw your ${lead.tradeCategory} listing and wanted to see if you have capacity for dispatch referrals this week?`;

  const promptSystemPromptAddition = [
    `[OUTBOUND LEAD CONTEXT]`,
    `Business Name: ${lead.businessName}`,
    `Trade Category: ${lead.tradeCategory.toUpperCase()}`,
    `Location: ${addressText}`,
    `Reputation: ${ratingText}`,
    `Website: ${lead.website || "N/A"}`,
    `Goal: Qualify if they need dispatch support or service partnership. If interested, propose booking a consult or sending a text-to-pay deposit.`,
  ].join("\n");

  return {
    leadId: lead.id,
    businessName: lead.businessName,
    phoneNumber: lead.phoneNumber,
    promptSystemPromptAddition,
    suggestedOpeningHook,
  };
}

/**
 * Validates TCPA calling hours (8:00 AM to 9:00 PM recipient local time)
 */
export function isWithinPermittedCallingHours(now = new Date(), timeZone = "America/Chicago"): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    });
    const hour = parseInt(formatter.format(now), 10);
    return hour >= 8 && hour < 21; // 8:00 AM to 8:59 PM
  } catch {
    // Fallback using UTC if timezone invalid
    const hour = now.getUTCHours();
    return hour >= 13 && hour < 25; // Approximate US working hours
  }
}

/**
 * Prepares and validates a lead for automated outbound qualification
 */
export function prepareLeadDial(
  lead: DiscoveredLead,
  options: {
    userId: string;
    agentId: string;
    callPurpose?: LeadDialRequest["callPurpose"];
    now?: Date;
    recipientTimeZone?: string;
  }
): {
  approved: boolean;
  dossier?: OutboundDossier;
  rejectionReason?: string;
} {
  if (lead.status === "do_not_call") {
    return {
      approved: false,
      rejectionReason: "Lead is flagged as DO NOT CALL.",
    };
  }

  const now = options.now ?? new Date();
  const tz = options.recipientTimeZone ?? "America/Chicago";

  if (!isWithinPermittedCallingHours(now, tz)) {
    return {
      approved: false,
      rejectionReason: `Outside permitted TCPA calling hours (8am - 9pm in ${tz}).`,
    };
  }

  const dossier = buildLeadDossier(lead);

  return {
    approved: true,
    dossier,
  };
}
