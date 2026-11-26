import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/api-error";
import type { ToolCallContext } from "../src/lib/agent-tool-types";

const h = vi.hoisted(() => ({
  configuration: vi.fn(),
  availability: vi.fn(),
  book: vi.fn(),
  externalAvailability: vi.fn(),
  externalBook: vi.fn(),
  liveAllowed: vi.fn(),
  insert: vi.fn(),
  webhook: vi.fn(),
  slack: vi.fn(),
  win: vi.fn(),
}));
vi.mock("../src/lib/native-calendar", () => ({
  getNativeCalendarConfiguration: h.configuration,
  getNativeCalendarAvailability: h.availability,
  bookNativeAppointment: h.book,
}));
vi.mock("../src/lib/integrations", () => ({
  IntegrationService: class {
    checkAvailability = h.externalAvailability;
    bookAppointment = h.externalBook;
  },
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: h.liveAllowed,
  assertExternalEntityActionAllowed: vi.fn(),
}));
vi.mock("../src/lib/webhook-helpers", () => ({ dispatchWebhook: h.webhook }));
vi.mock("../src/lib/slack-service", () => ({ postAgentNotification: h.slack }));
vi.mock("../src/lib/notifications", () => ({
  NotificationService: class {
    sendWinAlert = h.win;
  },
}));

import { handleCalendarToolCall } from "../src/lib/bot-tools/calendar";
import { enforceAgentToolResultTruth } from "../src/lib/agent-tool-result-truth";

const context: ToolCallContext = {
  toolCallId: "tool-1",
  agent: { id: "bot-1", user_id: "tenant-1" },
  webhookAgentId: "bot-1",
  message: { call: { id: "call-1", customer: { number: "+13125550100" } } },
  payload: {},
  log: { warn: vi.fn() },
  drizzle: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ timeZone: "America/Chicago" }] }) }),
    }),
    insert: () => ({ values: h.insert }),
  },
};
const args = {
  date: "2026-10-02",
  time: "10:00",
  timezone: "America/Chicago",
  customer_name: "Avery",
  service_type: "Consultation",
};
const appointment = {
  id: "appointment-1",
  startAt: new Date("2026-10-02T15:00:00Z"),
  endAt: new Date("2026-10-02T15:30:00Z"),
  timeZone: "America/Chicago",
  status: "Scheduled",
  created: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.configuration.mockResolvedValue({
    configured: true,
    settings: { enabled: true, duration_minutes: 30 },
  });
  h.liveAllowed.mockResolvedValue(undefined);
  h.book.mockResolvedValue(appointment);
  h.externalBook.mockResolvedValue(true);
  h.externalAvailability.mockResolvedValue("No busy times.");
  h.availability.mockResolvedValue({
    time_zone: "America/Chicago",
    duration_minutes: 30,
    booking_mode: "automatic",
    slots: [
      {
        date: args.date,
        time: args.time,
        start_at: appointment.startAt.toISOString(),
        end_at: appointment.endAt.toISOString(),
      },
    ],
  });
});

describe("native Calendar live tools", () => {
  it("offers only the native free slots without requiring a connected calendar", async () => {
    const result = await handleCalendarToolCall("check_calendar_availability", args, context);
    expect(JSON.parse(result!.result)).toMatchObject({
      calendar: "BotBound",
      time_zone: "America/Chicago",
      slots: [{ date: args.date, time: args.time }],
    });
    expect(h.availability).toHaveBeenCalledWith("tenant-1", { date: args.date });
    expect(h.externalAvailability).not.toHaveBeenCalled();
  });

  it("books automatically with a stable per-call tool key and returns the actual interval", async () => {
    const result = await handleCalendarToolCall("book_appointment", args, context);
    expect(result!.result).toMatch(/^Appointment booked for/);
    expect(result!.result).toContain("10:30");
    expect(h.book).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        agentId: "bot-1",
        callId: "call-1",
        customerName: "Avery",
        serviceType: "Consultation",
        date: args.date,
        time: args.time,
        timeZone: args.timezone,
        requestKey: expect.stringMatching(/^native-calendar:tool:[a-f0-9]{64}$/),
      }),
    );
    const firstKey = h.book.mock.calls[0][1].requestKey;
    h.book.mockResolvedValueOnce({ ...appointment, created: false });
    await handleCalendarToolCall("book_appointment", args, context);
    expect(h.webhook).toHaveBeenCalledOnce();
    expect(h.slack).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(h.win).toHaveBeenCalledOnce());
    expect(h.webhook).toHaveBeenCalledWith(
      "tenant-1",
      "appointment.booked",
      expect.objectContaining({ start_time: "2026-10-02T15:00:00.000Z" }),
    );
    expect(h.book.mock.calls[1][1].requestKey).toBe(firstKey);
    expect(h.externalBook).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it("describes owner-selected approval as pending, not booked", async () => {
    h.book.mockResolvedValue({ ...appointment, status: "Requested" });
    const result = await handleCalendarToolCall("book_appointment", args, context);
    expect(result!.result).toContain("pending owner approval and is not confirmed");
    expect(result!.result).not.toContain("Appointment booked");
    expect(h.webhook).not.toHaveBeenCalled();
    expect(h.slack).not.toHaveBeenCalled();
    expect(h.win).not.toHaveBeenCalled();
  });

  it("does not call a cancelled replay a new booking or request", async () => {
    h.book.mockResolvedValue({ ...appointment, status: "Cancelled" });
    const result = await handleCalendarToolCall("book_appointment", args, context);
    expect(result!.result).toContain("no longer scheduled");
    expect(result!.result).not.toContain("Appointment requested");
    expect(h.webhook).not.toHaveBeenCalled();
  });

  it.each(["Confirmed", "Rescheduled"])(
    "reports the current %s replay without duplicate notifications",
    async (status) => {
      h.book.mockResolvedValue({ ...appointment, status, created: false });
      const result = await handleCalendarToolCall("book_appointment", args, context);
      expect(result!.result).toMatch(/^Appointment booked for/);
      expect(result!.result).toContain("10:30");
      expect(h.webhook).not.toHaveBeenCalled();
      expect(h.slack).not.toHaveBeenCalled();
      expect(h.win).not.toHaveBeenCalled();
    },
  );

  it.each([
    "That time is no longer available.",
    "Booking is paused. Enable booking in Calendar first.",
  ])(
    "preserves a native refusal without falling back to an external booking: %s",
    async (message) => {
      h.book.mockRejectedValueOnce(AppError.conflict(message));
      const result = await handleCalendarToolCall("book_appointment", args, context);
      expect(result!.result).toContain(message);
      expect(result!.result).toContain("No appointment was confirmed");
      expect(h.externalBook).not.toHaveBeenCalled();
    },
  );

  it("keeps saved-but-paused availability on the authoritative native path", async () => {
    h.configuration.mockResolvedValue({
      configured: true,
      settings: { enabled: false, duration_minutes: 30 },
    });
    h.availability.mockRejectedValueOnce(AppError.conflict("Booking is paused."));
    const result = await handleCalendarToolCall("check_calendar_availability", args, context);
    expect(result!.result).toContain("Booking is paused");
    expect(h.externalAvailability).not.toHaveBeenCalled();
  });

  it("preserves connected fallback with the configured duration when native has never been configured", async () => {
    h.configuration.mockResolvedValue({
      configured: false,
      settings: { enabled: false, duration_minutes: 45 },
    });
    const result = await handleCalendarToolCall("book_appointment", args, context);
    expect(result!.result).toMatch(/^Appointment booked for/);
    expect(h.externalBook).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: "2026-10-02T15:00:00.000Z",
        endTime: "2026-10-02T15:45:00.000Z",
      }),
    );
    expect(h.book).not.toHaveBeenCalled();
    expect(h.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: new Date("2026-10-02T15:00:00Z"),
        endAt: new Date("2026-10-02T15:45:00Z"),
        timeZone: "America/Chicago",
        bookingSource: "connected",
        bufferMinutes: 0,
      }),
    );
    await vi.waitFor(() => expect(h.win).toHaveBeenCalledOnce());
  });

  it("keeps confirmed booking success when optional notifications fail", async () => {
    h.webhook.mockRejectedValueOnce(new Error("Destination unavailable"));
    h.slack.mockRejectedValueOnce(new Error("Destination unavailable"));
    h.win.mockRejectedValueOnce(new Error("Destination unavailable"));
    const result = await handleCalendarToolCall("book_appointment", args, context);
    expect(result!.result).toMatch(/^Appointment booked for/);
    await vi.waitFor(() => expect(h.win).toHaveBeenCalledOnce());
  });

  it.each(["native exception", "external exception", "external refusal"])(
    "does not promise an unsaved handoff or invite duplicate booking after %s",
    async (failure) => {
      if (failure.startsWith("external")) {
        h.configuration.mockResolvedValueOnce({
          configured: false,
          settings: { enabled: false, duration_minutes: 30 },
        });
        if (failure === "external exception") {
          h.externalBook.mockRejectedValueOnce(new Error("Provider response interrupted"));
        } else {
          h.externalBook.mockResolvedValueOnce(false);
        }
      } else {
        h.book.mockRejectedValueOnce(new Error("Booking result unavailable"));
      }

      const result = await handleCalendarToolCall("book_appointment", args, context);
      expect(result!.result).toContain("The appointment was not confirmed.");
      expect(result!.result).toContain("Check Calendar before trying to book again.");
      expect(result!.result).toContain("No follow-up task was saved.");
      expect(result!.result).toContain("If create_followup_task is available");
      expect(result!.result).toContain("confirm only after that tool succeeds");
      expect(result!.result).not.toMatch(/have someone confirm|appointment was not booked/i);
      expect(enforceAgentToolResultTruth("book_appointment", result!)).toEqual(result);
      expect(h.insert).not.toHaveBeenCalled();
      expect(h.webhook).not.toHaveBeenCalled();
      expect(h.slack).not.toHaveBeenCalled();
      expect(h.win).not.toHaveBeenCalled();
      if (failure.startsWith("native")) expect(h.externalBook).not.toHaveBeenCalled();
      else expect(h.book).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    "does not promise a callback when availability fails with native configured=%s",
    async (configured) => {
      h.configuration.mockResolvedValueOnce({
        configured,
        settings: { enabled: configured, duration_minutes: 30 },
      });
      const provider = configured ? h.availability : h.externalAvailability;
      provider.mockRejectedValueOnce(new Error("Calendar unavailable"));

      const result = await handleCalendarToolCall("check_calendar_availability", args, context);
      expect(result!.result).toContain("Calendar availability was not confirmed.");
      expect(result!.result).toContain("No follow-up task was saved.");
      expect(result!.result).toContain("If create_followup_task is available");
      expect(result!.result).not.toContain("have someone call you back");
      expect(enforceAgentToolResultTruth("check_calendar_availability", result!)).toEqual(result);
      expect(h.insert).not.toHaveBeenCalled();
      expect(h.book).not.toHaveBeenCalled();
      expect(h.externalBook).not.toHaveBeenCalled();
      expect(h.webhook).not.toHaveBeenCalled();
    },
  );

  it("preserves the live environment boundary before native mutation", async () => {
    h.liveAllowed.mockRejectedValueOnce(
      AppError.forbidden("Live actions are disabled in this workspace."),
    );
    await handleCalendarToolCall("book_appointment", args, context);
    expect(h.book).not.toHaveBeenCalled();
    expect(h.externalBook).not.toHaveBeenCalled();
  });
});
