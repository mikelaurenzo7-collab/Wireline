/* eslint-disable @typescript-eslint/no-explicit-any -- Live tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import {
  addMinutesToIso,
  CalendarTimeError,
  formatTimeRangeInZone,
  localDateTimeToUtcIso,
  localDateWindowToUtc,
  normalizeIanaTimeZone,
} from "../calendar-time";
import { dispatchWebhook } from "../webhook-helpers";
import { IntegrationService } from "../integrations";
import { AppError } from "../api-error";
import {
  bookNativeAppointment,
  getNativeCalendarAvailability,
  getNativeCalendarConfiguration,
} from "../native-calendar";
import { postAgentNotification as slackPostAgentNotification } from "../slack-service";
import {
  assertExternalEntityActionAllowed,
  assertLiveExternalActionAllowed,
} from "../account-environment-policy";

import type { ToolCallContext, ToolCallResult } from "../agent-tool-types";

async function resolveCalendarTimeZone(
  context: ToolCallContext,
  requestedTimeZone: unknown,
): Promise<string> {
  const [row] = await context.drizzle
    .select({ timeZone: schema.agents.timezone })
    .from(schema.agents)
    .where(
      and(eq(schema.agents.id, context.agent.id), eq(schema.agents.userId, context.agent.user_id)),
    )
    .limit(1);
  return normalizeIanaTimeZone(requestedTimeZone, row?.timeZone || "UTC");
}

function calendarInputFailure(toolCallId: string, error: unknown): ToolCallResult | null {
  if (error instanceof AppError && error.status >= 400 && error.status < 500) {
    return {
      toolCallId,
      result: `${error.message} No appointment was confirmed. Check the available times before trying again.`,
    };
  }
  if (!(error instanceof CalendarTimeError)) return null;
  return {
    toolCallId,
    result: `${error.message} Ask the caller to confirm the exact date, time, and timezone before trying again.`,
  };
}

function notifyBookedAppointment(
  context: ToolCallContext,
  booking: {
    title: string;
    startTime: string;
    endTime: string;
    timeZone: string;
    customerName: string;
    serviceType: string;
    displayTime: string;
  },
): void {
  const { agent, agentVoiceName, message } = context;
  // Notifications remain best effort. A confirmed booking must never become a
  // failed tool response because an optional notification destination is down.
  void Promise.allSettled([
    Promise.resolve().then(() =>
      dispatchWebhook(agent.user_id, "appointment.booked", {
        agent_id: agent.id,
        title: booking.title,
        start_time: booking.startTime,
        end_time: booking.endTime,
        timezone: booking.timeZone,
        customer_name: booking.customerName,
        service_type: booking.serviceType,
      }),
    ),
    Promise.resolve().then(() =>
      slackPostAgentNotification(
        agent.user_id,
        `Appointment booked: ${booking.title}\n${booking.displayTime}`,
        { agentName: agentVoiceName, caller: booking.customerName, outcome: "booked" },
      ),
    ),
    Promise.resolve().then(async () => {
      const { NotificationService } = await import("../notifications");
      // sendWinAlert retains the owner's opt-in and alert-recipient checks.
      return new NotificationService(agent.user_id).sendWinAlert({
        title: "Meeting booked",
        message: `${booking.customerName} · ${booking.serviceType} · ${booking.displayTime}`,
        callId: (message.call as { id?: string } | undefined)?.id,
        agentName: agentVoiceName,
        caller: booking.customerName,
        outcome: "booked",
      });
    }),
  ]);
}

export async function handleCalendarToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, message, toolCallId } = context;

  if (fn === "check_calendar_availability") {
    try {
      const { date, timezone } = args || {};
      const nativeCalendar = await getNativeCalendarConfiguration(agent.user_id);
      if (nativeCalendar.configured) {
        await assertLiveExternalActionAllowed(agent.user_id, "native_calendar_availability");
        const availability = await getNativeCalendarAvailability(agent.user_id, { date });
        return {
          toolCallId,
          result: JSON.stringify({
            calendar: "BotBound",
            ...availability,
            instruction:
              "Offer only these available slots, in the stated timezone. Check the booking result before saying an appointment is confirmed.",
          }),
        };
      }
      const timeZone = await resolveCalendarTimeZone(context, timezone);
      // Validate locally before IntegrationService catches provider errors so a
      // malformed or DST-invalid request produces a caller-correctable result.
      localDateWindowToUtc({ date, timeZone });
      const service = new IntegrationService(agent.user_id);
      const result = await service.checkAvailability({ date, timeZone });
      return { toolCallId, result };
    } catch (error) {
      const inputFailure = calendarInputFailure(toolCallId, error);
      if (inputFailure) return inputFailure;
      return {
        toolCallId,
        result:
          "I'm having trouble checking availability right now. Can I take your details and have someone call you back with times?",
      };
    }
  }

  if (fn === "book_appointment") {
    try {
      const { date, time, timezone, customer_name, service_type } = args || {};
      if (
        typeof customer_name !== "string" ||
        !customer_name.trim() ||
        typeof service_type !== "string" ||
        !service_type.trim()
      ) {
        return {
          toolCallId,
          result:
            "The appointment was not booked because the caller name or service is missing. Confirm both before trying again.",
        };
      }

      const nativeCalendar = await getNativeCalendarConfiguration(agent.user_id);
      if (nativeCalendar.configured) {
        await assertLiveExternalActionAllowed(agent.user_id, "native_calendar_booking");
        const callId = typeof message.call?.id === "string" ? message.call.id : undefined;
        const appointment = await bookNativeAppointment(agent.user_id, {
          agentId: agent.id,
          callId,
          date,
          time,
          timeZone: timezone,
          customerName: customer_name.trim(),
          serviceType: service_type.trim(),
          phoneNumber:
            typeof message.call?.customer?.number === "string"
              ? message.call.customer.number
              : undefined,
          requestKey: `native-calendar:tool:${createHash("sha256")
            .update(JSON.stringify([agent.id, callId || null, toolCallId]))
            .digest("hex")}`,
        });
        const start = new Date(appointment.startAt).toISOString();
        const end = new Date(appointment.endAt).toISOString();
        const displayTime = formatTimeRangeInZone(start, end, appointment.timeZone);
        if (appointment.status === "Scheduled" && appointment.created) {
          notifyBookedAppointment(context, {
            title: `${service_type.trim()} for ${customer_name.trim()}`,
            startTime: start,
            endTime: end,
            timeZone: appointment.timeZone,
            customerName: customer_name.trim(),
            serviceType: service_type.trim(),
            displayTime,
          });
        }
        return {
          toolCallId,
          result: ["Scheduled", "Confirmed", "Rescheduled"].includes(appointment.status || "")
            ? `Appointment booked for ${displayTime}.`
            : appointment.status === "Requested"
              ? `Appointment requested for ${displayTime}. It is pending owner approval and is not confirmed.`
              : "That appointment is no longer scheduled. Check availability before making a new booking.",
        };
      }

      const timeZone = await resolveCalendarTimeZone(context, timezone);
      const startTime = localDateTimeToUtcIso({ date, time, timeZone });
      const endTime = addMinutesToIso(startTime, nativeCalendar.settings.duration_minutes);
      const displayTime = formatTimeRangeInZone(startTime, endTime, timeZone);
      const title = `${service_type.trim()} for ${customer_name.trim()}`;
      const service = new IntegrationService(agent.user_id);

      const success = await service.bookAppointment({
        title,
        description: `Booked via BotBound. Confirmed timezone: ${timeZone}.`,
        startTime,
        endTime,
        agentId: agent.id,
      });
      if (success) {
        // Persist the booking to wireline_appointments. The calendar write
        // above only reaches the tenant's Google/Microsoft calendar — nothing
        // wrote the row that every in-product booking surface reads, so the
        // dashboard's appointment count, the goals tracker, the daily brief,
        // and the scheduled report all reported zero bookings no matter how
        // many the agent actually made. `date` and `time` are already
        // validated as YYYY-MM-DD / HH:mm by localDateTimeToUtcIso above, and
        // match the format the manual /api/appointments route stores.
        // Best-effort: a booking is confirmed to the caller either way, so a
        // write failure must never turn into a tool error.
        try {
          await context.drizzle.insert(schema.appointments).values({
            userId: agent.user_id,
            agentId: agent.id,
            callId: (message.call as { id?: string } | undefined)?.id ?? null,
            date: String(date).trim(),
            time: String(time).trim(),
            customerName: customer_name.trim(),
            serviceType: service_type.trim(),
            status: "Scheduled",
            startAt: new Date(startTime),
            endAt: new Date(endTime),
            timeZone,
            bufferMinutes: 0,
            bookingSource: "connected",
            notes: `Booked by your Bot. Confirmed timezone: ${timeZone}. ${displayTime}`,
            phoneNumber:
              (message.call as { customer?: { number?: string } } | undefined)?.customer?.number ??
              null,
          });
        } catch (persistError) {
          context.log.warn("Voice booking calendar write succeeded but appointment row failed", {
            userId: agent.user_id,
            agentId: agent.id,
            error: persistError instanceof Error ? persistError.message : String(persistError),
          });
        }

        notifyBookedAppointment(context, {
          title,
          startTime,
          endTime,
          timeZone,
          customerName: customer_name.trim(),
          serviceType: service_type.trim(),
          displayTime,
        });
      }
      return {
        toolCallId,
        result: success
          ? `Appointment booked for ${displayTime}.`
          : "I wasn't able to lock that in right now. Let me take your info and have someone confirm the appointment.",
      };
    } catch (error) {
      const inputFailure = calendarInputFailure(toolCallId, error);
      if (inputFailure) return inputFailure;
      return {
        toolCallId,
        result:
          "I ran into a hiccup booking that. Let me take your details and have someone confirm the appointment for you.",
      };
    }
  }

  if (fn === "send_contract") {
    try {
      const { recipient_name, recipient_email, template_id } = args || {};
      await assertLiveExternalActionAllowed(agent.user_id, "vapi_docusign_contract_send");
      await assertExternalEntityActionAllowed(agent.user_id, "vapi_docusign_contract_send", {
        email: recipient_email,
      });
      const { sendContract } = await import("../docusign-service");
      const result = await sendContract({
        recipientName: recipient_name,
        recipientEmail: recipient_email,
        templateId: template_id,
      });
      return {
        toolCallId,
        result: result
          ? `Contract sent. Envelope ID: ${result.envelopeId}`
          : "The document sending feature isn't set up for this account yet. I'll have someone from the team send it to you directly.",
      };
    } catch {
      return {
        toolCallId,
        result:
          "I wasn't able to send that document right now. I'll have someone from the team send it to you directly.",
      };
    }
  }

  return null;
}
