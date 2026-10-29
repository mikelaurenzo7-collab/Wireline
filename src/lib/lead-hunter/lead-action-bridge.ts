import type { LeadCallOutcome } from "./types";
import { globalLeadStore } from "./lead-scraper";
import { calculateTravelBuffer, createEphemeralHold, type EphemeralCalendarHold } from "../calendar-holds";
import { generateRfc5545Ics } from "../ics-generator";
import { constructStripePaymentLink } from "../stripe-voice-session";

export interface ProcessActionResult {
  success: boolean;
  actionTaken: string;
  details: Record<string, unknown>;
  hold?: EphemeralCalendarHold;
  icsContent?: string;
  paymentUrl?: string;
}

export function processLeadCallAction(outcome: LeadCallOutcome, userParams: {
  userId: string;
  agentId: string;
  senderEmail?: string;
  technicianBaseAddress?: string;
}): ProcessActionResult {
  const lead = globalLeadStore.getLead(outcome.leadId);

  switch (outcome.outcome) {
    case "booked_appointment": {
      if (!outcome.appointmentTime) {
        return { success: false, actionTaken: "none", details: { error: "Missing appointmentTime" } };
      }

      const slotStart = outcome.appointmentTime;
      const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000); // 1 hour slot

      // 1. Calculate travel buffer
      const buffer = calculateTravelBuffer(
        userParams.technicianBaseAddress,
        outcome.serviceAddress || lead?.address || "Customer Location"
      );

      // 2. Create ephemeral hold
      const hold = createEphemeralHold(
        userParams.userId,
        outcome.callSid,
        slotStart,
        slotEnd
      );

      // 3. Generate RFC 5545 .ics invite
      const icsContent = generateRfc5545Ics({
        uid: `lead-appt-${hold.holdId}`,
        summary: `Consultation: ${lead?.businessName || "New Lead"}`,
        description: `Discovery and service consult with ${lead?.businessName}. Notes: ${outcome.notes || "None"}`,
        start: slotStart,
        end: slotEnd,
        organizerEmail: userParams.senderEmail || "dispatch@bots.botbound.app",
        attendeeEmail: "customer@example.com",
        location: outcome.serviceAddress || lead?.address,
      });

      if (lead) {
        globalLeadStore.updateLeadStatus(lead.id, "qualified");
      }

      return {
        success: true,
        actionTaken: "booked_appointment",
        details: {
          holdId: hold.holdId,
          travelBufferMinutes: buffer.bufferMinutes,
          slotStart: slotStart.toISOString(),
          slotEnd: slotEnd.toISOString(),
        },
        hold,
        icsContent,
      };
    }

    case "sent_deposit_link": {
      const amountCents = outcome.depositAmountCents || 5000; // default $50.00
      const payment = constructStripePaymentLink({
        userId: userParams.userId,
        callSid: outcome.callSid,
        customerPhone: lead?.phoneNumber || "+15550000000",
        amountCents,
        description: `Deposit for consultation with ${lead?.businessName || "Client"}`,
      });

      if (lead) {
        globalLeadStore.updateLeadStatus(lead.id, "qualified");
      }

      return {
        success: true,
        actionTaken: "sent_deposit_link",
        details: {
          amountCents,
          paymentIntentId: payment.paymentIntentId,
        },
        paymentUrl: payment.paymentUrl,
      };
    }

    case "sent_email_quote":
    case "callback_requested": {
      if (lead) {
        globalLeadStore.updateLeadStatus(lead.id, "contacted");
      }
      return {
        success: true,
        actionTaken: outcome.outcome,
        details: { notes: outcome.notes },
      };
    }

    case "not_interested": {
      if (lead) {
        globalLeadStore.updateLeadStatus(lead.id, "do_not_call");
      }
      return {
        success: true,
        actionTaken: "marked_do_not_call",
        details: { reason: outcome.notes || "Customer declined interest" },
      };
    }
  }
}
