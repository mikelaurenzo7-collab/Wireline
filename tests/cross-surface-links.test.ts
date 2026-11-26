import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { peopleAddHref } from "../src/lib/people-client";
import { appointmentWhen } from "../src/lib/people/appointment-when";

const read = (path: string) => readFileSync(path, "utf8");

// Nov 26 surface audit: a customer's call, text, email and booking did not
// link to each other or to People. These guard the bridges in both directions.
describe("cross-surface links between channels and People", () => {
  it("opens People with the add form filled for a contact nobody has saved", () => {
    expect(peopleAddHref("phone", "+12025550100")).toBe("/people?add=phone&value=%2B12025550100");
    expect(peopleAddHref("email", "diego@example.com", "  Diego Morales ")).toBe(
      "/people?add=email&value=diego%40example.com&name=Diego+Morales",
    );
    expect(peopleAddHref("email", "a@example.com", "   ")).toBe(
      "/people?add=email&value=a%40example.com",
    );

    const people = read("src/pages/PeoplePage.tsx");
    expect(people).toContain('searchParams.get("add")');
    expect(people).toContain('next.delete("add")');
  });

  it("sends each People timeline entry to that exact call, thread or booking", () => {
    const people = read("src/pages/PeoplePage.tsx");
    const helper = people.slice(
      people.indexOf("function timelineHref"),
      people.indexOf("function PersonTimeline"),
    );
    expect(helper).toContain("item.ref.id");
    expect(helper).toContain("/phone?tab=logs&call=${id}");
    expect(helper).toContain("/inbox?tab=sms&thread=${id}");
    expect(helper).toContain("/inbox?tab=email&thread=${id}");
    expect(helper).toContain("/calendar?appointment=${id}");

    // Each destination honours its parameter.
    expect(read("src/pages/PhonePage.tsx")).toContain('focusCallId={searchParams.get("call")}');
    expect(read("src/components/PhoneCallHistoryPanel.tsx")).toContain("focusCallId={focusCallId}");
    expect(read("src/pages/CalendarPage.tsx")).toContain(
      'focusAppointmentId={params.get("appointment")}',
    );
    expect(read("src/pages/EmailPage.tsx")).toContain('initialThreadId={params.get("thread")}');
  });

  it("shows the customer, or offers to save them, on every channel's open item", () => {
    for (const [path, kind] of [
      ["src/components/CallLogsClaude.tsx", "phone"],
      ["src/components/SmsThreads.tsx", "phone"],
      ["src/components/EmailInbox.tsx", "email"],
    ] as const) {
      expect(read(path), path).toMatch(new RegExp(`<PersonLink\\s+kind="${kind}"`));
    }
    const link = read("src/components/PersonLink.tsx");
    expect(link).toContain("lookupPerson(kind, identifier");
    expect(link).toContain("peopleAddHref(kind, identifier, nameHint)");
  });

  it("writes booked times the way the Calendar does", () => {
    expect(
      appointmentWhen({ startAt: null, timeZone: null, date: "2026-11-27", time: "9:00 AM" }),
    ).toBe("Nov 27, 2026 · 9:00 AM");
    expect(
      appointmentWhen({ startAt: null, timeZone: null, date: "2026-11-27", time: "14:30" }),
    ).toBe("Nov 27, 2026 · 2:30 PM");
    expect(
      appointmentWhen({
        startAt: "2026-11-27T19:00:00.000Z",
        timeZone: "America/New_York",
        date: null,
        time: null,
      }),
    ).toBe("Nov 27, 2026 · 2:00 PM EST");
    expect(
      appointmentWhen({
        startAt: "2026-11-27T19:00:00.000Z",
        timeZone: "Not/AZone",
        date: "2026-11-27",
        time: "2:00 PM",
      }),
    ).toBe("Nov 27, 2026 · 2:00 PM");
    expect(appointmentWhen({ startAt: null, timeZone: null, date: null, time: null })).toBeNull();
  });
});
