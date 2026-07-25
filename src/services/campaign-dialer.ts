/* eslint-disable @typescript-eslint/no-explicit-any -- external integration data shape varies by provider. */
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, lt, inArray } from "drizzle-orm";
import { evaluateOutboundDialGate } from "../lib/outbound-dial-gate";
import { assertFederalDncForMarketing } from "../lib/federal-dnc-service";
import { OUTBOUND_CONSENT_VERSION } from "../lib/outbound-call-purpose";
import { placeOutboundCall } from "../lib/vapi-client";
import { assertOutboundVoiceAllowed } from "../lib/voice-spend-control";
import { CAMPAIGN_STATUS, LEAD_PROCESSABLE_STATUSES, LEAD_STATUS } from "../lib/outbound-status";
import { enqueue } from "../lib/job-queue";
import { jsonSafeId, toJsonbSafe } from "../lib/server-utils";

/**
 * Returns true when `now` (HH:MM, 24-hour) falls inside the [start, end] call
 * window. Handles two cases:
 *   - Same-day window (start <= end, e.g. 09:00–17:00): inclusive on both ends.
 *   - Overnight window (start > end, e.g. 20:00–06:00): matches times on either
 *     side of midnight. The naive `now >= start && now <= end` check would never
 *     be true for an overnight window, so the campaign would never dial.
 * All inputs are zero-padded HH:MM strings, so lexicographic comparison matches
 * chronological order.
 */
export function isWithinCallWindow(start: string, end: string, now: string): boolean {
  if (start <= end) {
    return now >= start && now <= end;
  }
  return now >= start || now <= end;
}

/** Format a Date as zero-padded HH:MM in the server's local timezone. */
export function formatLocalHhMm(date: Date = new Date()): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Next time the workspace call window opens at or after `from` (server local clock).
 * If already inside the window, returns `from`.
 */
export function nextCallWindowOpenAt(start: string, end: string, from: Date = new Date()): Date {
  const nowHhMm = formatLocalHhMm(from);
  if (isWithinCallWindow(start, end, nowHhMm)) {
    return from;
  }

  const [sh, sm] = start.split(":").map((p) => Number(p));
  const openToday = new Date(from);
  openToday.setHours(sh, sm, 0, 0);

  if (start <= end) {
    // Same-day window: before open → today; after close → tomorrow.
    if (nowHhMm < start) return openToday;
    const tomorrow = new Date(openToday);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // Overnight window: outside means end < now < start → next open is today at start.
  return openToday;
}

export class CampaignDialerService {
  /**
   * Processes a single running campaign (launch worker path).
   * When outside the workspace call window, enqueues a deferred campaign_dial
   * job for the next eligible open time instead of silently no-oping.
   */
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

  /**
   * Processes running campaigns and dials eligible leads (sweep / cron path).
   * @param userId Optional filter to only process campaigns for a specific user.
   */
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

  /**
   * Enqueue a deferred campaign_dial for the next workspace call-window open.
   * Campaign stays RUNNING; dialing resumes when the deferred job runs.
   */
  private async rescheduleCampaignDial(
    campaign: { id: string; userId: string; name: string },
    windowStart: string,
    windowEnd: string,
  ) {
    const runAt = nextCallWindowOpenAt(windowStart, windowEnd);

    // Avoid stacking multiple deferred dials for the same campaign.
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
      log.info(`Campaign ${campaign.name} outside call window — deferred job already pending`, {
        campaignId: campaign.id,
        jobId: existing.id,
        windowStart,
        windowEnd,
      });
      return;
    }

    const enq = await enqueue(drizzle, {
      userId: campaign.userId,
      type: "campaign_dial",
      payload: { userId: campaign.userId, campaignId: campaign.id },
      runAt,
    });
    if (!enq.ok) {
      log.error("Failed to reschedule campaign_dial outside call window", {
        campaignId: campaign.id,
        error: enq.error,
        nextOpenAt: runAt.toISOString(),
      });
      return;
    }
    log.info(`Campaign ${campaign.name} outside call window — rescheduled`, {
      campaignId: campaign.id,
      jobId: enq.jobId,
      nextOpenAt: runAt.toISOString(),
      windowStart,
      windowEnd,
    });
  }

  /**
   * Processes leads for a specific campaign.
   */
  private async processCampaignLeads(campaign: any) {
    const federalGate = assertFederalDncForMarketing();
    if (!federalGate.allowed) {
      log.warn("Campaign dialing paused — federal DNC vendor not configured", {
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
      .limit(50); // Process in batches

    for (const lead of leads) {
      await this.dialLead(lead, campaign);
    }

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

    if (Number(remaining?.count || 0) === 0) {
      await drizzle
        .update(schema.outboundCampaigns)
        .set({ status: CAMPAIGN_STATUS.COMPLETED, updatedAt: new Date() })
        .where(eq(schema.outboundCampaigns.id, campaign.id));
    }
  }

  /**
   * Dials a single lead.
   */
  private async dialLead(lead: any, campaign: any) {
    const leadIdStr = jsonSafeId(lead.id);
    try {
      if (!lead.customerNumber) return;

      const metadata = (lead.metadata || {}) as Record<string, unknown>;
      const gate = await evaluateOutboundDialGate({
        userId: lead.userId!,
        phone: lead.customerNumber,
        leadId: lead.id,
        lastCalledAt: lead.lastCalledAt,
        metadata,
      });

      if (!gate.allowed) {
        if (gate.reason === "federal_dnc_unconfigured") {
          log.warn("Skipping dial — federal DNC vendor not configured", {
            leadId: leadIdStr,
            campaignId: campaign.id,
          });
          return;
        }

        // Temporal denials (TCPA quiet hours, the lead's own 24h duplicate
        // window) must leave the lead processable. Writing their gate status
        // would retire the lead from LEAD_PROCESSABLE_STATUSES with no
        // callbackScheduledAt, so no engine ever re-dials it, max_attempts
        // becomes a no-op, and the campaign flips to "completed" without ever
        // dialing the lead. Record the trace in metadata and let the next
        // sweep re-evaluate once the window opens.
        if (
          gate.reason === "outside_permitted_calling_hours" ||
          gate.reason === "self_recent_call_scheduled"
        ) {
          if (gate.metadataPatch) {
            await drizzle
              .update(schema.outboundLeads)
              .set({ metadata: toJsonbSafe(gate.metadataPatch) as any })
              .where(eq(schema.outboundLeads.id, lead.id));
          }
          log.info("Dial deferred by temporal gate; lead stays processable", {
            leadId: leadIdStr,
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
              leadId: leadIdStr,
              campaignId: campaign.id,
              ...(gate.metadataPatch?.tcpa ? { tcpa: gate.metadataPatch.tcpa } : {}),
            }),
          });
        } else if (gate.reason === "skipped_duplicate") {
          log.info("Dial blocked by duplicate guard", {
            leadId: leadIdStr,
            campaignId: campaign.id,
            reason: gate.reason,
          });
        }
        return;
      }

      // Campaigns are automated outbound marketing by default — gate enforces consent.
      await assertOutboundVoiceAllowed({ userId: lead.userId!, source: "campaign", units: 0 });

      const result = await placeOutboundCall({
        userId: lead.userId!,
        agentId: campaign.agentId!,
        customerNumber: lead.customerNumber!,
        customerName: lead.customerName,
        context: lead.context || campaign.goal,
      });

      if (result.ok) {
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
              leadId: leadIdStr,
              campaignId: campaign.id,
              call_purpose: "marketing_or_sales",
              consent_version: OUTBOUND_CONSENT_VERSION,
              source: "campaign",
            }),
          }),
        ]);
      } else {
        await drizzle
          .update(schema.outboundLeads)
          .set({
            status: LEAD_STATUS.ERROR,
            attempts: (lead.attempts || 0) + 1,
            lastCalledAt: new Date(),
            metadata: toJsonbSafe({
              ...((lead.metadata as object) || {}),
              lastError: result.error,
            }) as any,
          })
          .where(eq(schema.outboundLeads.id, lead.id));
      }
    } catch (error: any) {
      log.error(`Failed to dial lead ${leadIdStr}`, { error: error.message });
    }
  }

  /**
   * Checks if the current time (or a provided time) is within the workspace
   * call window. Uses the server's local clock — not lead-state jurisdiction hours.
   */
  private isWithinWindow(start: string, end: string, currentTimeOverride?: string): boolean {
    const now = currentTimeOverride || formatLocalHhMm();
    return isWithinCallWindow(start, end, now);
  }
}
