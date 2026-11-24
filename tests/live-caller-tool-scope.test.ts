import { beforeEach, describe, expect, it, vi } from "vitest";

const zoom = vi.hoisted(() => ({ createMeeting: vi.fn() }));
vi.mock("../src/lib/zoom-service", () => zoom);
vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: vi.fn().mockResolvedValue(undefined),
  assertExternalEntityActionAllowed: vi.fn().mockResolvedValue(undefined),
  liveExternalActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
  externalEntityActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
}));

import type { ToolCallContext } from "../src/lib/agent-tool-types";
import { handleCoreToolCall } from "../src/lib/bot-tools/core";
import { handleWorkflowToolCall } from "../src/lib/bot-tools/workflow";
import { callerPhoneKey } from "../src/lib/caller-phone-match";

const quietLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function liveCall(callerNumber: string | null, drizzle: unknown = {}): ToolCallContext {
  const call = {
    id: "call-1",
    type: "inboundPhoneCall",
    provider: "openai",
    customer: { number: callerNumber },
  };
  return {
    toolCallId: "tool-1",
    payload: { call },
    message: { type: "tool-calls", call },
    agent: { id: "agent-1", user_id: "tenant-1" },
    webhookAgentId: "agent-1",
    drizzle,
    log: quietLog,
  } as unknown as ToolCallContext;
}

const PRIVATE_READ_REFUSAL =
  "I can't safely verify this caller for private account details during this call. No records were shared. Offer a team follow-up.";
const CALLER_LINKED_WRITE_REFUSAL =
  "I can't safely verify this caller to change an existing record or schedule an automatic callback. No records were changed and no callback was scheduled. Offer a team follow-up.";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("caller phone matching", () => {
  it("does not collapse different country codes with the same final ten digits", () => {
    const us = "+1 202 555 0123";
    const uk = "+44 202 555 0123";

    expect(callerPhoneKey(us)).not.toBe(callerPhoneKey(uk));
    expect(callerPhoneKey("(202) 555-0123")).toBe(callerPhoneKey(us));
  });
});

describe("private live voice reads", () => {
  it("refuses every private read handler without reading a database", async () => {
    const select = vi.fn();
    const context = liveCall("+12025550123", { select });

    const results = await Promise.all([
      handleCoreToolCall("search_leads", { query: "all customers" }, context),
      handleWorkflowToolCall("view_recent_interactions", {}, context),
    ]);

    for (const result of results) expect(result?.result).toBe(PRIVATE_READ_REFUSAL);
    expect(select).not.toHaveBeenCalled();
  });
});

describe("unverified live voice writes", () => {
  it("refuses lead and callback actions before any mutation", async () => {
    const db = { select: vi.fn(), update: vi.fn(), insert: vi.fn() };
    const context = liveCall("+12025550123", db);

    const [leadStatus, callback] = await Promise.all([
      handleCoreToolCall("update_lead_status", { status: "qualified" }, context),
      handleWorkflowToolCall(
        "schedule_callback",
        { callback_datetime: "2026-10-18T12:00:00-05:00", notes: "automatic callback" },
        context,
      ),
    ]);

    expect(leadStatus?.result).toBe(CALLER_LINKED_WRITE_REFUSAL);
    expect(callback?.result).toBe(CALLER_LINKED_WRITE_REFUSAL);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("lead lookups on a live call", () => {
  function leadDb(rows: unknown[]) {
    const where = vi.fn().mockResolvedValue(rows);
    const select = vi.fn(() => ({ from: vi.fn(() => ({ where })) }));
    return { db: { select }, select, where };
  }

  it("does not expose a matching lead record to an unverified live caller", async () => {
    const { db, select } = leadDb([
      {
        id: "maya",
        name: "Maya Brooks",
        status: "new",
        customerNumber: "+15125550142",
        context: "",
      },
    ]);
    const result = await handleCoreToolCall(
      "search_leads",
      { query: "anyone named John" },
      liveCall("+15125550142", db),
    );

    expect(select).not.toHaveBeenCalled();
    expect(result?.result).not.toContain("Maya Brooks");
  });

  it("does not search fuzzy or cross-country lead candidates", async () => {
    const { db, select } = leadDb([
      {
        id: "other",
        name: "Other country",
        status: "new",
        customerNumber: "+44 202 555 0123",
        context: "",
      },
      {
        id: "substring",
        name: "Substring",
        status: "new",
        customerNumber: "+1 9202 555 0123",
        context: "",
      },
      {
        id: "caller",
        name: "Caller",
        status: "new",
        customerNumber: "+1 (202) 555-0123",
        context: "",
      },
    ]);
    const result = await handleCoreToolCall("search_leads", {}, liveCall("+12025550123", db));

    expect(select).not.toHaveBeenCalled();
    expect(result?.result).not.toContain("Caller");
    expect(result?.result).not.toContain("Other country");
    expect(result?.result).not.toContain("Substring");
  });

  it("does not write the status of a fuzzy or cross-country lead candidate", async () => {
    const { db, select } = leadDb([
      { id: "other-country", customerNumber: "+44 202 555 0123" },
      { id: "substring", customerNumber: "+1 9202 555 0123" },
    ]);
    const update = vi.fn();
    const result = await handleCoreToolCall(
      "update_lead_status",
      { status: "qualified", notes: "asked about pricing" },
      liveCall("+12025550123", { ...db, update }),
    );

    expect(select).not.toHaveBeenCalled();
    expect(result?.result).toBe(CALLER_LINKED_WRITE_REFUSAL);
    expect(update).not.toHaveBeenCalled();
  });

  it("withholds ambiguous same-number leads and does not update either status", async () => {
    const { db } = leadDb([
      { id: "lead-a", name: "Avery", status: "new", customerNumber: "+1 202 555 0123" },
      { id: "lead-b", name: "Blair", status: "new", customerNumber: "(202) 555-0123" },
    ]);
    const update = vi.fn();
    const context = liveCall("+12025550123", { ...db, update });

    const read = await handleCoreToolCall("search_leads", {}, context);
    const write = await handleCoreToolCall("update_lead_status", { status: "qualified" }, context);

    expect(read?.result).not.toContain("Avery");
    expect(read?.result).not.toContain("Blair");
    expect(write?.result).toBe(CALLER_LINKED_WRITE_REFUSAL);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a lead lookup when the call has no caller number", async () => {
    const { db, select } = leadDb([]);
    const result = await handleCoreToolCall("search_leads", { query: "John" }, liveCall(null, db));

    expect(result?.result).not.toContain("John");
    expect(select).not.toHaveBeenCalled();
  });
});

describe("connector failure results", () => {
  it.each(["empty", "error"])("does not promise a Zoom follow-up after %s", async (failure) => {
    if (failure === "error")
      zoom.createMeeting.mockRejectedValueOnce(new Error("provider unavailable"));
    else zoom.createMeeting.mockResolvedValueOnce(null);
    const insert = vi.fn();
    const result = await handleWorkflowToolCall(
      "generate_zoom_link",
      { topic: "Product demo", start_time: "2026-11-04T16:00:00Z" },
      liveCall(null, { insert }),
    );
    expect(zoom.createMeeting).toHaveBeenCalledOnce();
    expect(result?.result).toContain("Zoom meeting link was not confirmed");
    expect(result?.result).toContain("No follow-up task was saved");
    expect(result?.result).toContain("create_followup_task");
    expect(result?.result).not.toMatch(/will follow up|I'll have/i);
    expect(insert).not.toHaveBeenCalled();
  });

  it("retains provider-confirmed Zoom success", async () => {
    zoom.createMeeting.mockResolvedValueOnce({ join_url: "https://zoom.example/meeting" });
    const result = await handleWorkflowToolCall(
      "generate_zoom_link",
      { topic: "Product demo" },
      liveCall(null),
    );
    expect(result?.result).toBe("Meeting link created: https://zoom.example/meeting");
  });
});
