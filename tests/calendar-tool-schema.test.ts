import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { VAPI_TOOL_DEFS } from "../src/lib/vapi-helpers";
import { toVapiFunctionTools } from "../src/lib/vapi-tool-format";

describe("calendar tool schema", () => {
  it("requires exact local date and IANA timezone for availability", () => {
    const [tool] = toVapiFunctionTools([VAPI_TOOL_DEFS.check_calendar_availability]);
    const parameters = tool.function.parameters as {
      properties: Record<string, { pattern?: string; description?: string }>;
      required: string[];
    };

    expect(parameters.required).toEqual(expect.arrayContaining(["date", "timezone"]));
    expect(parameters.properties.date.pattern).toBe("^\\d{4}-\\d{2}-\\d{2}$");
    expect(parameters.properties.timezone.description).toContain("IANA timezone");
  });

  it("requires exact 24-hour time before booking", () => {
    const [tool] = toVapiFunctionTools([VAPI_TOOL_DEFS.book_appointment]);
    const parameters = tool.function.parameters as {
      properties: Record<string, { pattern?: string }>;
      required: string[];
    };

    expect(parameters.required).toEqual(
      expect.arrayContaining(["date", "time", "timezone", "customer_name", "service_type"]),
    );
    expect(parameters.properties.time.pattern).toBe("^(?:[01]\\d|2[0-3]):[0-5]\\d$");
  });
});

describe("calendar execution boundaries", () => {
  const actionEngine = readFileSync("src/lib/action-engine.ts", "utf8");
  const calendarHandler = readFileSync("src/routes/vapi/tool-handlers-calendar.ts", "utf8");

  it("does not use server-local date parsing in either scheduling path", () => {
    expect(actionEngine).not.toMatch(/new Date\(`\$\{action\.payload\.date\}/);
    expect(calendarHandler).not.toMatch(/new Date\(`\$\{date\}/);
    expect(actionEngine).toContain("localDateTimeToUtcIso");
    expect(calendarHandler).toContain("localDateTimeToUtcIso");
  });

  it("does not send calendar PII to the platform Meta destination", () => {
    expect(actionEngine).not.toContain("sendMetaConversion");
    expect(actionEngine).not.toContain('eventName: "Schedule"');
  });

  it("maps action-engine names to canonical agent tools and blocks platform DocuSign automation", () => {
    expect(actionEngine).toContain('schedule_calendar: "book_appointment"');
    expect(actionEngine).toContain('notify_slack: "send_slack_notification"');
    expect(actionEngine).toContain("Automated contract sending is disabled");
  });
});
