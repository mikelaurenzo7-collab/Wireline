/**
 * Lean 4-Pillar Test Harness & Reference Oracle
 * 
 * Implements authoritative interface contracts and reference behavioral models
 * for the BotBound Lean 4 Pillars as defined in PROJECT.md and ORIGINAL_REQUEST.md:
 * 
 * Pillar 1: Zero-Conflict Calendar Engine (Travel Buffers, 5-min Soft Holds, RFC 5545 .ics Generation, Trade Portal Mirroring)
 * Pillar 2: In-Call Stripe Settlements & Autonomous Goodwill Wallets ($100/mo cap, $25/resolution)
 * Pillar 3: Voice-to-Browserbase Real-Time Bridge (Non-blocking async tools, conversational fillers during 3-8s latency, 2FA alerts)
 * Pillar 4: Branded Bot Email Identity via AgentMail (Inbox provisioning, transactional confirmations, payment receipts, reply triage)
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";

// Re-export production implementations for single-source-of-truth
export {
  MIN_TRAVEL_BUFFER_MINUTES,
  MAX_TRAVEL_BUFFER_MINUTES,
  DEFAULT_SOFT_HOLD_TTL_SECONDS,
  calculateTravelBuffer,
  createEphemeralHold,
  isHoldActive,
  checkSlotWithBufferAndHolds,
  type EphemeralCalendarHold,
  type TravelBufferCalculation,
} from "../../../src/lib/calendar-holds";

export {
  escapeIcsText,
  formatIcsDate,
  generateRfc5545Ics,
} from "../../../src/lib/ics-generator";

export {
  DEFAULT_MONTHLY_GOODWILL_CAP_CENTS,
  DEFAULT_PER_RESOLUTION_CAP_CENTS,
  evaluateGoodwillCredit,
  type GoodwillWalletPolicy,
} from "../../../src/lib/goodwill-wallet-policy";

export {
  VoiceSessionRegistry,
  globalVoiceSessionRegistry,
  constructStripePaymentLink,
  verifyStripeWebhookHMAC,
  type InCallPaymentRequest,
  type InCallPaymentEvent,
} from "../../../src/lib/stripe-voice-session";

export {
  buildBrandedInboxParams,
  type SendAppointmentEmailParams,
  type SendPaymentReceiptEmailParams,
} from "../../../src/lib/agentmail-transactional";

export {
  triageInboundCustomerReply,
  type EmailTriageResult,
} from "../../../src/lib/agentmail-triage";

// ============================================================================
// 1. Interface Contracts (PROJECT.md § Interface Contracts)
// ============================================================================

export interface AsyncBrowserTaskRequest {
  userId: string;
  callSid: string;
  action: "lookup_customer" | "check_parts_portal" | "mirror_dispatch_job";
  portalUrl: string;
  parameters: Record<string, unknown>;
  fillerCallback?: (phrase: string) => Promise<void>;
  statusCallback?: (status: "running" | "waiting_2fa" | "completed" | "failed", data?: unknown) => Promise<void>;
}

export interface AsyncBrowserTaskResult {
  taskId: string;
  success: boolean;
  extractedData?: Record<string, unknown>;
  requiresTakeover?: boolean;
  takeoverReason?: "captcha" | "two_factor" | "credential_required";
  errorMessage?: string;
}

// ============================================================================
// 4. Pillar 3: Voice-to-Browserbase Real-Time Bridge
// ============================================================================

export const CONVERSATIONAL_STATUS_FILLERS = [
  "Checking the dispatch schedule on the portal now...",
  "Looking up the service account details, one moment please...",
  "Accessing the trade management portal for you...",
  "Just verifying technician availability for that window...",
  "Confirming the job site buffer and travel times...",
  "Syncing this appointment with our field dispatch board...",
  "Checking parts inventory at the local distributor...",
  "Almost there, just finalizing the portal lookup...",
] as const;

export function selectConversationalFiller(turnIndex: number, previousFillers: string[] = []): string {
  const available = CONVERSATIONAL_STATUS_FILLERS.filter((f) => !previousFillers.includes(f));
  const pool = available.length > 0 ? available : CONVERSATIONAL_STATUS_FILLERS;
  return pool[turnIndex % pool.length];
}

export function create2FATakeoverAlert(params: {
  taskId: string;
  reason: "captcha" | "two_factor" | "credential_required";
  callSid: string;
  portalUrl: string;
  ownerPhone: string;
  ownerEmail: string;
}): {
  smsAlert: { to: string; message: string };
  agentMailAlert: { to: string; subject: string; agentAction: string };
} {
  const reasonText =
    params.reason === "two_factor"
      ? "2FA SMS verification code"
      : params.reason === "captcha"
      ? "CAPTCHA puzzle verification"
      : "Portal credentials";

  return {
    smsAlert: {
      to: params.ownerPhone,
      message: `[BotBound URGENT] Action Required: ${reasonText} encountered on ${params.portalUrl} during active call ${params.callSid}. Reply with code or click to take over: https://botbound.app/studio/takeover/${params.taskId}`,
    },
    agentMailAlert: {
      to: params.ownerEmail,
      subject: `[HUMAN TAKEOVER] 2FA Barrier on ${params.portalUrl} (Task ${params.taskId})`,
      agentAction: "agent_attach_human",
    },
  };
}
