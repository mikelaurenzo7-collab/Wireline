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

/** Pacing delay before the next batch of an actively-dialing campaign. */
const CAMPAIGN_CONTINUATION_DELAY_MS = 60_000;
/** Re-check delay while the last batch's calls are still in flight. */
const CAMPAIGN_DRAIN_RECHECK_DELAY_MS = 5 * 60_000;

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
   * Enqueue a campaign_dial job for `runAt` unless one is already pending for
   * this campaign. This is the campaign's only continuation driver: nothing
   * else re-enqueues dialing, so every path that leaves processable or
   * in-flight leads behind must call this before returning.
   */
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

    const enq = await enqueue(drizzle, {
      userId: campaign.userId,
      type: "campaign_dial",
      payload: { userId: campaign.userId, campaignId: campaign.id },
      runAt,
    });
    if (!enq.ok) {
      log.error(`Failed to enqueue campaign_dial (${why})`, {
        campaignId: campaign.id,
        error: enq.error,
        runAt: runAt.toISOString(),
      });
      return;
    }
    log.info(`Campaign ${campaign.name}: dial continuation enqueued (${why})`, {
      campaignId: campaign.id,
      jobId: enq.jobId,
      runAt: runAt.toISOString(),
    });
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
    await this.ensureDialJob(
      campaign,
      nextCallWindowOpenAt(windowStart, windowEnd),
      "outside call window",
    );
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

    if (Number(remaining?.count || 0) > 0) {
      // More processable leads than this batch covered (or temporal deferrals
      // that stay processable). Without this re-enqueue nothing ever dials
      // them: launch and the call-window rescheduler are the only other
      // producers of campaign_dial jobs.
      await this.ensureDialJob(
        campaign,
        new Date(Date.now() + CAMPAIGN_CONTINUATION_DELAY_MS),
        "processable leads remain",
      );
      return;
    }

    const [inFlight] = await drizzle
      .select({ count: sql<number>`count(*)` })
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.campaignId, campaign.id),
          eq(schema.outboundLeads.status, LEAD_STATUS.DIALING),
        ),
      );

    if (Number(inFlight?.count || 0) > 0) {
      // Calls are still in flight. The end-of-call digest can move them to
      // Retrying, so completing now would strand those leads in a COMPLETED
      // campaign that no sweep revisits. Check back after the calls land.
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

  /**
   * Dials a single lead.
   */
  private async dialLead(lead: any, campaign: any) {
    const leadIdStr = jsonSafeId(lead.id);
    // True once a call was actually placed; the catch block must not release
    // the Dialing claim for a live call.
    let placed = false;
    try {
      if (!lead.customerNumber) return;

      // Atomically claim the lead before evaluating or dialing. Two dial jobs
      // for the same campaign (double-clicked launch, overlapping sweeps, a
      // manual job run racing the cron) select overlapping batches; without
      // this flip-if-still-processable fence both would dial the same consumer
      // simultaneously. The loser of the race sees zero rows and moves on.
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
          leadId: leadIdStr,
          campaignId: campaign.id,
        });
        return;
      }
      const priorStatus = lead.status as string;

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
          await drizzle
            .update(schema.outboundLeads)
            .set({ status: priorStatus })
            .where(eq(schema.outboundLeads.id, lead.id));
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
          // Release the claim: restore the pre-claim processable status so the
          // next dial job re-evaluates once the window opens.
          await drizzle
            .update(schema.outboundLeads)
            .set({
              status: priorStatus,
              ...(gate.metadataPatch ? { metadata: toJsonbSafe(gate.metadataPatch) as any } : {}),
            })
            .where(eq(schema.outboundLeads.id, lead.id));
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
        callPurpose: "marketing_or_sales",
      });

      if (result.ok) {
        placed = true;
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
        // A failed placement is not a placed call: leave lastCalledAt alone so
        // the 24h duplicate window doesn't suppress the retry, and keep the
        // lead retryable until attempts run out instead of retiring it to the
        // terminal Error status on the first provider blip.
        const attempts = (lead.attempts || 0) + 1;
        await drizzle
          .update(schema.outboundLeads)
          .set({
            status:
              attempts >= (campaign.maxAttempts || 3)
                ? LEAD_STATUS.MAX_ATTEMPTS
                : LEAD_STATUS.RETRYING,
            attempts,
            metadata: toJsonbSafe({
              ...((lead.metadata as object) || {}),
              lastError: result.error,
              lastDialErrorAt: new Date().toISOString(),
            }) as any,
          })
          .where(eq(schema.outboundLeads.id, lead.id));
      }
    } catch (error: any) {
      log.error(`Failed to dial lead ${leadIdStr}`, { error: error.message });
      // The lead was claimed into Dialing above; release the claim so an
      // exception (spend guard, provider throw) cannot strand it in-flight
      // forever. Attempts still advance so a hard-failing lead terminates.
      if (placed) return;
      try {
        const attempts = (lead.attempts || 0) + 1;
        await drizzle
          .update(schema.outboundLeads)
          .set({
            status:
              attempts >= (campaign.maxAttempts || 3)
                ? LEAD_STATUS.MAX_ATTEMPTS
                : LEAD_STATUS.RETRYING,
            attempts,
            metadata: toJsonbSafe({
              ...((lead.metadata as object) || {}),
              lastError: error?.message || "dial exception",
              lastDialErrorAt: new Date().toISOString(),
            }) as any,
          })
          .where(
            and(
              eq(schema.outboundLeads.id, lead.id),
              eq(schema.outboundLeads.status, LEAD_STATUS.DIALING),
            ),
          );
      } catch (releaseError: any) {
        log.error(`Failed to release claimed lead ${leadIdStr}`, {
          error: releaseError?.message,
        });
      }
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
