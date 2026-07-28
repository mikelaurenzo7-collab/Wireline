import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/ai-brains.ts", "utf8");

describe("post-call action extraction", () => {
  it("requires exact timezone-safe calendar payloads", () => {
    expect(source).toContain("{event_name, date, time, timezone, attendees}");
    expect(source).toContain("date is YYYY-MM-DD");
    expect(source).toContain("time is 24-hour HH:mm");
    expect(source).toContain("confirmed IANA zone");
    expect(source).toContain("Never emit schedule_calendar when any of date, time, or timezone is unresolved");
  });

  it("keeps the autonomous extraction surface deliberately narrower than manual actions", () => {
    const extractionBlock = source.slice(
      source.indexOf("const BUSINESS_ACTIONS_TOOL"),
      source.indexOf("const QA_SCORE_TOOL"),
    );
    expect(extractionBlock).toContain('"schedule_calendar"');
    expect(extractionBlock).not.toContain('"send_contract"');
    expect(extractionBlock).not.toContain('"prospect_leads"');
    expect(extractionBlock).not.toContain('"notify_slack"');
  });
});
