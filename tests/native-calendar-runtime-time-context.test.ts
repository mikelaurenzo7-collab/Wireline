import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_TOOL_DEFS } from "../src/lib/agent-runtime-helpers";
import { DEFAULT_NATIVE_CALENDAR } from "../src/lib/native-calendar-policy";
import {
  composeOpenAIRealtimeInstructions,
  type OpenAIRealtimeInstructionAgent,
  type OpenAIRealtimeTenantSettings,
} from "../src/lib/voice/openai-phone-agent-runtime";

const agent: OpenAIRealtimeInstructionAgent = {
  id: "agent-calendar-date",
  userId: "calendar-date-owner",
  name: "Front Desk",
  role: "receptionist",
  firstMessage: null,
  personalityVibe: null,
  systemPromptOverride: null,
  complianceMode: null,
  disallowedTopics: null,
  escalationKeywords: null,
  escalationPhone: null,
  escalationEmail: null,
  businessVariables: null,
  enabledTools: ["check_calendar_availability", "book_appointment"],
  timezone: "UTC",
  kpiFocus: null,
  voiceProvider: "openai",
  voiceId: "coral",
  phoneVoiceId: null,
};
const tenant: OpenAIRealtimeTenantSettings = {
  aiTier: null,
  twilioMessagingEnabled: false,
  twilioLookupEnabled: false,
  businessName: "Date Test Shop",
};

function compose(nativeCalendar?: unknown) {
  return composeOpenAIRealtimeInstructions({
    agent,
    tenant: { ...tenant, nativeCalendar },
    personality: "",
    directives: [],
    knowledge: [],
    surface: "phone",
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  // Sunday evening in Chicago, already Monday in the Bot's configured UTC zone.
  vi.setSystemTime(new Date("2026-09-28T02:06:48Z"));
});
afterEach(() => vi.useRealTimers());

describe("native Calendar runtime date authority", () => {
  it("keeps a corrected department handoff distinct from a booked appointment on the phone", () => {
    const prompt = compose(DEFAULT_NATIVE_CALENDAR);
    expect(prompt).toContain("A correction replaces the previous request");
    expect(prompt).toContain("including their exact spelling");
    expect(prompt).toContain("Once the caller accepts, stay with the message");
    expect(prompt).toContain("Only send a booking confirmation after a successful booking");
  });
  it("uses Chicago Sunday/tomorrow Monday for scheduling without changing the Bot timezone", () => {
    const saved = {
      ...structuredClone(DEFAULT_NATIVE_CALENDAR),
      enabled: true,
      time_zone: "America/Chicago",
    };
    const before = structuredClone({ agent, saved });
    const prompt = compose(saved);
    expect(prompt).toContain("Today is 2026-09-28. The Bot's configured IANA timezone is UTC");
    expect(prompt).toContain("Calendar-local today is 2026-09-27; tomorrow is 2026-09-28");
    expect(prompt).toContain("The saved Calendar timezone is America/Chicago");
    expect(prompt).toContain("even when the Bot's date differs");
    expect(prompt).toContain("say the day, date and time naturally in the business's local time");
    expect(prompt).toContain("Name the timezone only when the caller asks");
    expect(prompt).toContain("Check availability and use only the returned slots");
    expect(prompt).not.toContain("tomorrow is 2026-09-29");
    expect({ agent, saved }).toEqual(before);
  });

  it.each([
    ["automatic", "use book_appointment without asking the owner"],
    ["approval", "requested time was sent to the business to confirm"],
    ["inherit", "describe its returned status"],
  ] as const)("uses the saved %s confirmation policy on calls", (booking_mode, instruction) => {
    const prompt = compose({ ...DEFAULT_NATIVE_CALENDAR, enabled: true, booking_mode });
    expect(prompt).toContain(instruction);
    expect(compose({ ...DEFAULT_NATIVE_CALENDAR, enabled: false, booking_mode })).not.toContain(
      instruction,
    );
  });

  it("gathers booking details and keeps internal setting names off an approval call", () => {
    // Live call, Nov 22: the Bot said "approval mode" aloud and never asked
    // for the caller's details.
    const prompt = compose({ ...DEFAULT_NATIVE_CALENDAR, enabled: true, booking_mode: "approval" });
    expect(prompt).toContain("the caller’s name, the service they want, and the address");
    expect(prompt).toContain("Never describe this as approval mode or a booking setting.");
    expect(prompt).toContain("When the result is queued or Requested");
    expect(prompt).not.toContain("The owner chose approval");
    expect(prompt).toContain("Answer the caller's latest question before anything else.");
    expect(prompt).toContain("Never say setting, mode, or tool names to the caller");
  });

  it("tries other times before asking the owner to handle an automatic booking exception", () => {
    const prompt = compose({
      ...DEFAULT_NATIVE_CALENDAR,
      enabled: true,
      booking_mode: "automatic",
    });
    expect(prompt).toContain("Submit only the final date and time the caller agrees to");
    expect(prompt).toContain("ask for another window and check availability again");
    expect(prompt).toContain(
      "If no time works or the caller needs an exception, offer owner follow-up",
    );
    expect(prompt).toContain(
      "When create_followup_task is available, save the caller’s preferred times",
    );
    expect(prompt).toContain("confirm the follow-up only after the tool succeeds");
    expect(prompt).toContain("use book_appointment without asking the owner");
  });

  it.each([undefined, null])(
    "retains the Bot-local fallback without a saved Calendar (%s)",
    (value) => {
      const prompt = compose(value);
      expect(prompt).toContain("Today is 2026-09-28. The Bot's configured IANA timezone is UTC");
      expect(prompt).toContain("say the day, date and time naturally in the business's local time");
      expect(prompt).toContain("Name the timezone only when the caller asks");
      expect(prompt).not.toContain("NATIVE CALENDAR TIME CONTEXT:");
      expect(prompt).not.toContain("America/Chicago");
    },
  );

  it("preserves a configured Calendar's date and pause without implying bookings can continue", () => {
    const prompt = compose({ ...DEFAULT_NATIVE_CALENDAR, time_zone: "America/Chicago" });
    expect(prompt).toContain("Calendar-local today is 2026-09-27; tomorrow is 2026-09-28");
    expect(prompt).toContain("Native Calendar booking is paused");
    expect(prompt).toContain("do not bypass the pause with a connected calendar");
  });

  it("does not invent a scheduling timezone from malformed saved configuration", () => {
    const prompt = compose({ ...DEFAULT_NATIVE_CALENDAR, time_zone: "Unknown/City" });
    expect(prompt).toContain("Saved Calendar settings could not be verified");
    expect(prompt).not.toContain("Calendar-local today");
    expect(prompt).not.toContain("The saved Calendar timezone is Unknown/City");
  });

  it("advances the local calendar date across the year boundary", () => {
    vi.setSystemTime(new Date("2027-01-01T02:00:00Z"));
    expect(compose({ ...DEFAULT_NATIVE_CALENDAR, time_zone: "America/Chicago" })).toContain(
      "Calendar-local today is 2026-12-31; tomorrow is 2027-01-01",
    );
  });

  it("gives tools the same Calendar date and returned-zone authority as the prompt", () => {
    const availability = AGENT_TOOL_DEFS.check_calendar_availability.parameters;
    const booking = AGENT_TOOL_DEFS.book_appointment.parameters;
    expect(availability.properties.date.description).toContain("Calendar-local today");
    expect(availability.properties.timezone.description).toContain(
      "saved native Calendar timezone",
    );
    expect(booking.properties.timezone.description).toContain("timezone returned by availability");
    expect(booking.properties.timezone.description).toContain("saved timezone is authoritative");
  });

  it("requires a timezone for the booking tool and only clarifies it with the caller when needed", () => {
    const booking = AGENT_TOOL_DEFS.book_appointment;
    expect(booking.parameters.required).toContain("timezone");
    expect(booking.description).toContain("the caller confirms the date and time");
    expect(booking.description).toContain("only when asked or when the time is ambiguous");
  });
});
