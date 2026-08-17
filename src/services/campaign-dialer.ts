/* eslint-disable @typescript-eslint/no-explicit-any -- external integration data shape varies by provider. */
import { and, eq, inArray, lt, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { assertFederalDncForMarketing } from "../lib/federal-dnc-service";
import { enqueue } from "../lib/job-queue";
import { evaluateOutboundDialGate } from "../lib/outbound-dial-gate";
import { OUTBOUND_CONSENT_VERSION } from "../lib/outbound-call-purpose";
import {
  CAMPAIGN_STATUS,
  LEAD_PROCESSABLE_STATUSES,
  LEAD_STATUS,
} from "../lib/outbound-status";
import { drizzle, log } from "../lib/server-context";
import { jsonSafeId, toJsonbSafe } from "../lib/server-utils";
import { placeOutboundCall } from "../lib/voice/outbound-call-service";
import { assertOutboundVoiceAllowed } from "../lib/voice-spend-control";

export function isWithinCallWindow(start: string, end: string, now: string): boolean {
  if (start <= end) return now >= start && now <= end;
  return now >= start || now <= end;
}

export function formatLocalHhMm(date: Date = new Date()): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function nextCallWindowOpenAt(start: string, end: string, from: Date = new Date()): Date {
  const nowHhMm = formatLocalHhMm(from);
  if (isWithinCallWindow(start, end, nowHhMm)) return from;

  const [hour, minute] = start.split(":").map((part) => Number(part));
  const openToday = new Date(from);
  openToday.setHours(hour, minute, 0, 0);
  if (start <= end) {
    if (nowHhMm < start) return openToday;
    const tomorrow = new Date(openToday);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  return openToday;
}

const CAMPAIGN_CONTINUATION_DELAY_MS = 60_000;
const CAMPAIGN_DRAIN_RECHECK_DELAY_MS = 5 * 60_000;
const LIVE_LEAD_STATUSES = [LEAD_STATUS.DIALING, LEAD_STATUS.CONNECTED] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Merge campaign diagnostics onto the latest row without erasing native voice
 * correlation written concurrently by Twilio or xAI webhooks. */
async function updateLeadAfterPlacementFailure(input: {
  leadId: bigint;
  userId: string;
  status: string;
  attempts: number;
  error: string;
  doNotRetry: boolean;
}) {
  await drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-outbound:${String(input.leadId)}`}))`,
    );
    const [current] = await tx
      .select({ metadata: schema.outboundLeads.metadata })
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.id, input.leadId),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      )
      .limit(1);
    const metadata = record(current?.metadata);
    const nativeVoice = record(metadata.native_voice);
    await tx
      .update(schema.outboundLeads)
      .set({
        status: input.status,
        attempts: input.attempts,
        metadata: toJsonbSafe({
          ...metadata,
          native_voice: {
            ...nativeVoice,
            ...(input.doNotRetry ? { do_not_retry: true } : {}),
          },
          lastError: input.error,
          lastDialErrorAt: new Date().toISOString(),
        }) as any,
      })
      .where(
        and(
          eq(schema.outboundLeads.id, input.leadId),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      );
  });
}

export class CampaignDialerService {
  async processCampaignById(userId: string, campaignId: string) {
    const [campaign] = await drizzle
      .select()
      .from(schema.outboundCampaigns)
      .where(
        and(
          eq(schema.outboundCampaigns.id, campaignId),
          eq(schema.outboundCampaigns.userId, userId),
          eq(schema.outboundCampaigns.status, CAMPAIGN_STATUS.RUNNING),
        ),
      )
      .limit(1);

    if (!campaign) {
      log.warn("campaign_dial: campaign not RUNNING or not found", { userId, campaignId });
      return;
    }

    const windowStart = campaign.callWindowStart || "09:00";
    const windowEnd = campaign.callWindowEnd || "17:00";
    if (!this.isWithinWindow(windowStart, windowEnd)) {
      await this.rescheduleCampaignDial(campaign, windowStart, windowEnd);
      return;
    }
    await this.processCampaignLeads(campaign);
  }

  async processAllCampaigns(userId?: string) {
    try {
      const activeCampaigns = await drizzle
        .select()
        .from(schema.outboundCampaigns)
        .where(
          userId
            ? and(
                eq(schema.outboundCampaigns.status, CAMPAIGN_STATUS.RUNNING),
                eq(schema.outboundCampaigns.userId, userId),
              )
            : eq(schema.outboundCampaigns.status, CAMPAIGN_STATUS.RUNNING),
        );

      log.info(`Processing ${activeCampaigns.length} running campaigns`);
      for (const campaign of activeCampaigns) {
        const windowStart = campaign.callWindowStart || "09:00";
        const windowEnd = campaign.callWindowEnd || "17:00";
        if (this.isWithinWindow(windowStart, windowEnd)) {
          await this.processCampaignLeads(campaign);
        } else {
          await this.rescheduleCampaignDial(campaign, windowStart, windowEnd);
        }
      }
    } catch (error: any) {
      log.error("Failed to process campaigns", { error: error.message });
    }
  }

  private async ensureDialJob(
    campaign: { id: string; userId: string; name: string },
    runAt: Date,
    why: string,
  ) {
    const [existing] = await drizzle
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, campaign.userId),
          eq(schema.jobs.type, "campaign_dial"),
          eq(schema.jobs.status, "pending"),
          sql`${schema.jobs.payload}->>'campaignId' = ${campaign.id}`,
        ),
      )
      .limit(1);

    if (existing) {
      log.info(`Campaign ${campaign.name}: dial job already pending (${why})`, {
        campaignId: campaign.id,
        jobId: existing.id,
      });
      return;
    }

    const enqueued = await enqueue(drizzle, {
      userId: campaign.userId,
      type: "campaign_dial",
      payload: { userId: campaign.userId, campaignId: campaign.id },
      runAt,
    });
    if (!enqueued.ok) {
      log.error(`Failed to enqueue campaign_dial (${why})`, {
        campaignId: campaign.id,
        error: enqueued.error,
        runAt: runAt.toISOString(),
      });
      return;
    }
    log.info(`Campaign ${campaign.name}: dial continuation enqueued (${why})`, {
      campaignId: campaign.id,
      jobId: enqueued.jobId,
      runAt: runAt.toISOString(),
    });
  }

  private async rescheduleCampaignDial(
    campaign: { id: string; userId: string; name: string },
    windowStart: string,
    windowEnd: string,
  ) {
    await this.ensureDialJob(
      campaign,
      nextCallWindowOpenAt(windowStart, windowEnd),
      "outside call window",
    );
  }

  private async processCampaignLeads(campaign: any) {
    const federalGate = assertFederalDncForMarketing();
    if (!federalGate.allowed) {
      log.warn("Campaign dialing paused, federal DNC vendor not configured", {
        campaignId: campaign.id,
        code: federalGate.code,
      });
      return;
    }

    const leads = await drizzle
      .select()
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.campaignId, campaign.id),
          inArray(schema.outboundLeads.status, [...LEAD_PROCESSABLE_STATUSES]),
          lt(schema.outboundLeads.attempts, campaign.maxAttempts || 3),
        ),
      )
      .limit(50);

    for (const lead of leads) await this.dialLead(lead, campaign);

    const [remaining] = await drizzle
      .select({ count: sql<number>`count(*)` })
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.campaignId, campaign.id),
          inArray(schema.outboundLeads.status, [...LEAD_PROCESSABLE_STATUSES]),
          lt(schema.outboundLeads.attempts, campaign.maxAttempts || 3),
        ),
      );
    if (Number(remaining?.count || 0) > 0) {
      await this.ensureDialJob(
        campaign,
        new Date(Date.now() + CAMPAIGN_CONTINUATION_DELAY_MS),
        "processable leads remain",
      );
      return;
    }

    // Native xAI attachment moves an answered lead from Dialing to Connected
    // before the conversation ends. Both states are in flight; completing the
    // campaign while a Connected call is still running would strand a retry or
    // post-call disposition created moments later.
    const [inFlight] = await drizzle
      .select({ count: sql<number>`count(*)` })
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.campaignId, campaign.id),
          inArray(schema.outboundLeads.status, [...LIVE_LEAD_STATUSES]),
        ),
      );
    if (Number(inFlight?.count || 0) > 0) {
      await this.ensureDialJob(
        campaign,
        new Date(Date.now() + CAMPAIGN_DRAIN_RECHECK_DELAY_MS),
        "calls in flight",
      );
      return;
    }

    await drizzle
      .update(schema.outboundCampaigns)
      .set({ status: CAMPAIGN_STATUS.COMPLETED, updatedAt: new Date() })
      .where(eq(schema.outboundCampaigns.id, campaign.id));
  }

  private async dialLead(lead: any, campaign: any) {
    const leadIdString = jsonSafeId(lead.id);
    let providerAccepted = false;
    try {
      if (!lead.customerNumber) return;

      const claimed = await drizzle
        .update(schema.outboundLeads)
        .set({ status: LEAD_STATUS.DIALING })
        .where(
          and(
            eq(schema.outboundLeads.id, lead.id),
            inArray(schema.outboundLeads.status, [...LEAD_PROCESSABLE_STATUSES]),
          ),
        )
        .returning({ id: schema.outboundLeads.id });
      if (claimed.length === 0) {
        log.info("Lead already claimed by a concurrent dial job", {
          leadId: leadIdString,
          campaignId: campaign.id,
        });
        return;
      }
      const priorStatus = lead.status as string;
      const metadata = record(lead.metadata);
      const gate = await evaluateOutboundDialGate({
        userId: lead.userId!,
        phone: lead.customerNumber,
        leadId: lead.id,
        lastCalledAt: lead.lastCalledAt,
        metadata,
      });

      if (!gate.allowed) {
        if (gate.reason === "federal_dnc_unconfigured") {
          await drizzle
            .update(schema.outboundLeads)
            .set({ status: priorStatus })
            .where(eq(schema.outboundLeads.id, lead.id));
          log.warn("Skipping dial, federal DNC vendor not configured", {
            leadId: leadIdString,
            campaignId: campaign.id,
          });
          return;
        }

        if (
          gate.reason === "outside_permitted_calling_hours" ||
          gate.reason === "self_recent_call_scheduled"
        ) {
          await drizzle
            .update(schema.outboundLeads)
            .set({
              status: priorStatus,
              ...(gate.metadataPatch ? { metadata: toJsonbSafe(gate.metadataPatch) as any } : {}),
            })
            .where(eq(schema.outboundLeads.id, lead.id));
          log.info("Dial deferred by temporal gate; lead stays processable", {
            leadId: leadIdString,
            campaignId: campaign.id,
            reason: gate.reason,
          });
          return;
        }

        await drizzle
          .update(schema.outboundLeads)
          .set({
            status: gate.status,
            ...(gate.metadataPatch ? { metadata: toJsonbSafe(gate.metadataPatch) as any } : {}),
          })
          .where(eq(schema.outboundLeads.id, lead.id));

        if (gate.consentLogEvent) {
          await drizzle.insert(schema.consentLog).values({
            userId: lead.userId!,
            customerNumber: lead.customerNumber,
            event: gate.consentLogEvent,
            state: "blocked",
            metadata: toJsonbSafe({
              leadId: leadIdString,
              campaignId: campaign.id,
              ...(gate.metadataPatch?.tcpa ? { tcpa: gate.metadataPatch.tcpa } : {}),
            }),
          });
        } else if (gate.reason === "skipped_duplicate") {
          log.info("Dial blocked by duplicate guard", {
            leadId: leadIdString,
            campaignId: campaign.id,
            reason: gate.reason,
          });
        }
        return;
      }

      await assertOutboundVoiceAllowed({ userId: lead.userId!, source: "campaign", units: 0 });
      const result = await placeOutboundCall({
        userId: lead.userId!,
        agentId: campaign.agentId!,
        customerNumber: lead.customerNumber!,
        customerName: lead.customerName,
        context: lead.context || campaign.goal,
        callPurpose: "marketing_or_sales",
        leadId: lead.id,
      });

      if (result.ok) {
        providerAccepted = true;
        await Promise.all([
          drizzle
            .update(schema.outboundLeads)
            .set({
              status: LEAD_STATUS.DIALING,
              attempts: (lead.attempts || 0) + 1,
              lastCalledAt: new Date(),
              callId: result.callId,
            })
            .where(eq(schema.outboundLeads.id, lead.id)),
          drizzle.insert(schema.consentLog).values({
            userId: lead.userId!,
            customerNumber: lead.customerNumber,
            callId: result.callId,
            event: "outbound_call_placed",
            state: "initiated",
            metadata: toJsonbSafe({
              leadId: leadIdString,
              campaignId: campaign.id,
              call_purpose: "marketing_or_sales",
              consent_version: OUTBOUND_CONSENT_VERSION,
              source: "campaign",
            }),
          }),
        ]);
        return;
      }

      const attempts = (lead.attempts || 0) + 1;
      const doNotRetry = result.doNotRetry === true || result.providerOutcomeAmbiguous === true;
      const nextStatus = doNotRetry
        ? LEAD_STATUS.ERROR
        : attempts >= (campaign.maxAttempts || 3)
          ? LEAD_STATUS.MAX_ATTEMPTS
          : LEAD_STATUS.RETRYING;
      await updateLeadAfterPlacementFailure({
        leadId: lead.id,
        userId: lead.userId!,
        status: nextStatus,
        attempts,
        error: result.error || "dial rejected",
        doNotRetry,
      });
      if (doNotRetry) {
        log.warn("Campaign call outcome uncertain; automatic retry suppressed", {
          leadId: leadIdString,
          campaignId: campaign.id,
        });
      }
    } catch (error: any) {
      log.error(`Failed to dial lead ${leadIdString}`, { error: error.message });
      if (providerAccepted) return;
      try {
        const attempts = (lead.attempts || 0) + 1;
        await updateLeadAfterPlacementFailure({
          leadId: lead.id,
          userId: lead.userId!,
          status:
            attempts >= (campaign.maxAttempts || 3)
              ? LEAD_STATUS.MAX_ATTEMPTS
              : LEAD_STATUS.RETRYING,
          attempts,
          error: error?.message || "dial exception",
          doNotRetry: false,
        });
      } catch (releaseError: any) {
        log.error(`Failed to release claimed lead ${leadIdString}`, {
          error: releaseError?.message,
        });
      }
    }
  }

  private isWithinWindow(start: string, end: string, currentTimeOverride?: string): boolean {
    const now = currentTimeOverride || formatLocalHhMm();
    return isWithinCallWindow(start, end, now);
  }
}
