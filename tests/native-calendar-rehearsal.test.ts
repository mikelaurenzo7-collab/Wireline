import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ settings: vi.fn(), availability: vi.fn(), book: vi.fn() }));
vi.mock("../src/lib/native-calendar", () => ({
  getNativeCalendarSettings: h.settings,
  getNativeCalendarAvailability: h.availability,
  bookNativeAppointment: h.book,
}));
import { nativeCalendarRehearsalContext } from "../src/lib/native-calendar-rehearsal";

const settings = {
  enabled: true,
  time_zone: "America/Chicago",
  duration_minutes: 30,
  booking_mode: "automatic",
  weekly_hours: [{ day: 1, start: "09:00", end: "17:00" }],
};
beforeEach(() => {
  vi.clearAllMocks();
  h.settings.mockResolvedValue(settings);
});

describe("native Calendar rehearsal policy", () => {
  it("reflects automatic booking without inventing owner approval or touching live availability", async () => {
    const prompt = await nativeCalendarRehearsalContext("tenant", ["book_appointment"]);
    expect(prompt).toContain("owner chose automatic booking");
    expect(prompt).toContain("Do not ask for separate owner confirmation");
    expect(prompt).toContain("no live calendar access and creates no appointments");
    expect(h.settings).toHaveBeenCalledWith("tenant");
    expect(h.availability).not.toHaveBeenCalled();
    expect(h.book).not.toHaveBeenCalled();
  });

  it("follows Ask for approval when calendar confirmation is inherited", async () => {
    h.settings.mockResolvedValue({ ...settings, booking_mode: "inherit" });
    const prompt = await nativeCalendarRehearsalContext("tenant", ["book_appointment"]);
    expect(prompt).toContain("follows this Bot's permission");
    expect(prompt).toContain("Never describe a pending request as confirmed");
    expect(prompt).not.toContain("owner chose automatic booking");
    expect(h.book).not.toHaveBeenCalled();
  });

  it("reflects approval only when the owner selected it", async () => {
    h.settings.mockResolvedValue({ ...settings, booking_mode: "approval" });
    const prompt = await nativeCalendarRehearsalContext("tenant", ["book_appointment"]);
    expect(prompt).toContain("live booking requests remain pending until the owner approves");
    expect(prompt).toContain("Never describe a pending request as confirmed");
    expect(h.book).not.toHaveBeenCalled();
  });

  it("honors a saved disabled tool without expanding the Bot's permissions", async () => {
    const prompt = await nativeCalendarRehearsalContext("tenant", ["search_knowledge_base"]);
    expect(prompt).toContain("Scheduling tools are not enabled");
    expect(h.settings).not.toHaveBeenCalled();
  });

  it("does not imply that paused calendars or unread settings provide live slots", async () => {
    h.settings.mockResolvedValueOnce({ ...settings, enabled: false });
    expect(await nativeCalendarRehearsalContext("tenant", null)).toContain(
      "booking is not enabled",
    );
    h.settings.mockRejectedValueOnce(new Error("Database unavailable"));
    expect(await nativeCalendarRehearsalContext("tenant", null)).toContain("could not be verified");
    expect(h.availability).not.toHaveBeenCalled();
    expect(h.book).not.toHaveBeenCalled();
  });
});
