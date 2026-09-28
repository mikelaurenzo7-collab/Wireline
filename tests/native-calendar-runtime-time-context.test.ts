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
    expect(prompt).toContain("Check availability and use only the returned slots");
    expect(prompt).not.toContain("tomorrow is 2026-09-29");
    expect({ agent, saved }).toEqual(before);
  });

  it.each([undefined, null])(
    "retains the Bot-local fallback without a saved Calendar (%s)",
    (value) => {
      const prompt = compose(value);
      expect(prompt).toContain("Today is 2026-09-28. The Bot's configured IANA timezone is UTC");
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
});
