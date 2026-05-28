/* eslint-disable @typescript-eslint/no-explicit-any -- external integration data shape varies by provider. */
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import { isDncBlocked } from "../lib/compliance";
import { evaluateOutboundConsent } from "../lib/tcpa-consent";
import { placeOutboundCall } from "../lib/vapi-client";

export class CampaignDialerService {
  /**
   * Processes active campaigns and dials eligible leads.
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
                eq(schema.outboundCampaigns.status, "active"),
                eq(schema.outboundCampaigns.userId, userId),
              )
            : eq(schema.outboundCampaigns.status, "active"),
        );

      log.info(`Processing ${activeCampaigns.length} active campaigns`);

      for (const campaign of activeCampaigns) {
        if (
          this.isWithinWindow(
            campaign.callWindowStart || "09:00",
            campaign.callWindowEnd || "17:00",
          )
        ) {
          await this.processCampaignLeads(campaign);
        } else {
          log.info(`Campaign ${campaign.name} is outside its call window`);
        }
      }
    } catch (error: any) {
      log.error("Failed to process campaigns", { error: error.message });
    }
  }

  /**
   * Processes leads for a specific campaign.
   */
  private async processCampaignLeads(campaign: any) {
    const leads = await drizzle
      .select()
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.campaignId, campaign.id),
          sql`${schema.outboundLeads.status} IN ('Pending', 'Retrying')`,
          lt(schema.outboundLeads.attempts, campaign.maxAttempts || 3),
        ),
      )
      .limit(50); // Process in batches

    for (const lead of leads) {
      await this.dialLead(lead, campaign);
    }
  }

  /**
   * Dials a single lead.
   */
  private async dialLead(lead: any, campaign: any) {
    try {
      // 1. Check DNC
      if (lead.customerNumber && (await isDncBlocked(lead.userId!, lead.customerNumber))) {
        await drizzle
          .update(schema.outboundLeads)
          .set({ status: "Blocked-DNC" })
          .where(eq(schema.outboundLeads.id, lead.id));

        await drizzle.insert(schema.consentLog).values({
          userId: lead.userId!,
          customerNumber: lead.customerNumber,
          event: "outbound_blocked_dnc",
          state: "blocked",
          metadata: { leadId: lead.id, campaignId: campaign.id },
        });
        return;
      }

      // 2. TCPA consent gate. Campaigns are automated outbound marketing by default,
      // so they require the same explicit consent attestation as manual dials.
      const metadata = (lead.metadata || {}) as Record<string, unknown>;
      const tcpaDecision = evaluateOutboundConsent({
        phone: lead.customerNumber!,
        is_internal_dnc: false,
        is_marketing_call: true,
        has_express_written_consent: metadata.has_express_written_consent === true,
      });
      if (!tcpaDecision.allowed) {
        await drizzle
          .update(schema.outboundLeads)
          .set({
            status: "Blocked-TCPA",
            metadata: { ...metadata, tcpa: tcpaDecision },
          })
          .where(eq(schema.outboundLeads.id, lead.id));

        await drizzle.insert(schema.consentLog).values({
          userId: lead.userId!,
          customerNumber: lead.customerNumber,
          event: "outbound_blocked_tcpa",
          state: "blocked",
          metadata: { leadId: lead.id, campaignId: campaign.id, tcpa: tcpaDecision },
        });
        return;
      }

      // 3. Place Call
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
              status: "Dialing",
              attempts: sql`${schema.outboundLeads.attempts} + 1`,
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
            metadata: { leadId: lead.id, campaignId: campaign.id },
          }),
        ]);
      } else {
        await drizzle
          .update(schema.outboundLeads)
          .set({
            status: "Error",
            attempts: sql`${schema.outboundLeads.attempts} + 1`,
            lastCalledAt: new Date(),
            metadata: { ...((lead.metadata as object) || {}), lastError: result.error },
          })
          .where(eq(schema.outboundLeads.id, lead.id));
      }
    } catch (error: any) {
      log.error(`Failed to dial lead ${lead.id}`, { error: error.message });
    }
  }

  /**
   * Checks if the current time (or a provided time) is within the call window.
   */
  private isWithinWindow(start: string, end: string, currentTimeOverride?: string): boolean {
    const now =
      currentTimeOverride ||
      new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return now >= start && now <= end;
  }
}
