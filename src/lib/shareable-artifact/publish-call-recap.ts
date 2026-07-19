/**
 * Compose a shareable call recap from a `runPostCallDigest` context and
 * publish it when the tenant's plan entitles the workflow. Wraps the raw
 * digest data with humane defaults for hero and outcome-label, elides
 * PII-adjacent transcript when neither party actually said anything, and
 * returns null silently on any storage/validation error so the digest
 * email always sends.
 */
import { eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { planById } from "../plan-catalog";
import { isBrandedArtifactEntitled } from "./entitlement";
import { publishCallRecap, type RecapArtifactHandle } from "./service";
import type {
  CallRecapAction,
  CallRecapContent,
  CallRecapMoment,
  CallRecapTranscriptLine,
} from "./types";

const OUTCOME_LABELS: Record<string, string> = {
  booked: "Booked",
  qualified: "Qualified",
  followup: "Follow-up",
  info: "Info request",
  unreachable: "Unreachable",
  dnc: "Do not contact",
  other: "Notable",
};

function pickOutcomeLabel(tag: string): string {
  return OUTCOME_LABELS[tag] ?? "Notable";
}

function pickHero(input: {
  outcomeTag: string;
  outcomeLabel: string;
  agentName?: string | null;
  customerName?: string | null;
  summary?: string | null;
}): string {
  const summary = (input.summary || "").trim().split(/\n+/)[0] || "";
  if (summary && summary.length <= 140) return summary;
  const caller = input.customerName?.trim();
  const label = input.outcomeLabel;
  if (caller && label) return `${label} — ${caller}`;
  if (caller) return `Call with ${caller}`;
  return `${input.outcomeLabel} call`;
}

function parseTranscript(raw: string | null | undefined): CallRecapTranscriptLine[] {
  if (!raw) return [];
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 200);
  const parsed: CallRecapTranscriptLine[] = [];
  for (const line of lines) {
    const match = /^\s*(agent|caller|customer|assistant|user)[:\-\s]+(.*)$/i.exec(line);
    if (match) {
      const speaker = match[1].toLowerCase();
      const role = speaker === "agent" || speaker === "assistant" ? "agent" : "caller";
      const text = match[2].trim();
      if (text) parsed.push({ role, text });
    } else {
      parsed.push({ role: "caller", text: line });
    }
  }
  return parsed;
}

function nextActionsFor(tag: string): CallRecapAction[] {
  switch (tag) {
    case "booked":
      return [
        {
          description: "Verify the calendar confirmation and attach prep notes.",
          owner: "Assign the meeting owner",
        },
      ];
    case "qualified":
      return [
        {
          description: "Route to the closer or schedule a demo within 48 hours.",
          owner: "Sales",
        },
      ];
    case "followup":
      return [
        {
          description: "Create or confirm the promised callback; keep the reason and timing.",
        },
      ];
    case "info":
      return [
        {
          description:
            "Review the caller's unanswered question and add verified guidance to Training.",
        },
      ];
    case "dnc":
      return [
        {
          description: "Confirm the number is suppressed from all future outreach.",
        },
      ];
    case "unreachable":
      return [
        { description: "Review retry policy and voicemail settings before another attempt." },
      ];
    default:
      return [
        {
          description:
            "Review the transcript, confirm the outcome, and assign any needed follow-up.",
        },
      ];
  }
}

function extractMoments(summary: string | null | undefined): CallRecapMoment[] {
  if (!summary) return [];
  const bullets = summary
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d+.\s]+/, "").trim())
    .filter((line) => line.length > 0 && line.length <= 200)
    .slice(0, 8);
  if (bullets.length <= 1) return [];
  return bullets.map((note, index) => ({ atSeconds: index * 30, note }));
}

async function tenantPlanId(userId: string): Promise<string | null> {
  try {
    const [row] = await drizzle
      .select({ plan: schema.subscriptions.plan })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1);
    return row?.plan ?? null;
  } catch {
    return null;
  }
}

export interface MaybePublishCallRecapInput {
  userId: string;
  agentId?: string | null;
  agentName?: string | null;
  agentRole?: string | null;
  callLogId: string | number | bigint;
  customerName?: string | null;
  customerNumber?: string | null;
  direction?: string | null;
  durationSeconds?: number | null;
  summary?: string | null;
  transcript?: string | null;
  sentiment?: string | null;
  intentLabel?: string | null;
  outcomeTag: string;
  campaignSource: string | null;
  startedAtIso?: string | null;
}

/**
 * Publish a call recap if the tenant is entitled. Returns the shareable
 * URL when a recap was published, otherwise null. All errors are logged
 * and swallowed so the digest email path stays healthy.
 */
export async function maybePublishCallRecap(
  input: MaybePublishCallRecapInput,
): Promise<RecapArtifactHandle | null> {
  try {
    const planId = await tenantPlanId(input.userId);
    const plan = planById(planId);
    if (!isBrandedArtifactEntitled(plan)) return null;

    const outcomeLabel = pickOutcomeLabel(input.outcomeTag);
    const hero = pickHero({
      outcomeTag: input.outcomeTag,
      outcomeLabel,
      agentName: input.agentName,
      customerName: input.customerName,
      summary: input.summary,
    });

    const content: CallRecapContent = {
      kind: "call_recap",
      version: 1,
      agent: {
        name: input.agentName?.trim() || "Wireline agent",
        role: input.agentRole ?? null,
      },
      outcome:
        (input.outcomeTag as CallRecapContent["outcome"]) in OUTCOME_LABELS
          ? (input.outcomeTag as CallRecapContent["outcome"])
          : "other",
      outcomeLabel,
      hero,
      metadata: {
        direction:
          input.direction === "inbound" || input.direction === "outbound" ? input.direction : null,
        durationSeconds: input.durationSeconds ?? null,
        startedAtIso: input.startedAtIso ?? null,
        campaignSource: input.campaignSource,
      },
      caller: {
        name: input.customerName ?? null,
        phone: input.customerNumber ?? null,
      },
      moments: extractMoments(input.summary),
      actions: nextActionsFor(input.outcomeTag),
      transcript: parseTranscript(input.transcript),
      sentiment: input.sentiment ?? null,
      intentLabel: input.intentLabel ?? null,
      summary: input.summary ?? null,
    };

    return await publishCallRecap({
      userId: input.userId,
      agentId: input.agentId ?? null,
      callLogId: input.callLogId,
      content,
    });
  } catch (error) {
    log.warn("recap artifact publish skipped — non-fatal", {
      userId: input.userId,
      callLogId: String(input.callLogId),
      error: getErrorMessage(error),
    });
    return null;
  }
}
