import { describe, expect, it } from "vitest";

import { parseApprovalTasks, parseTriageBucket } from "../src/lib/approval-inbox-response";

const validTriage = {
  hot_leads: [{ id: "lead-1" }],
  compliance: [{ id: "compliance-1" }],
  pending_tasks: [{ id: "task-1" }],
  knowledge_gaps: [{ id: "gap-1" }],
  escalations: [{ id: "escalation-1" }],
  counts: {
    hot_leads: 1,
    compliance: 1,
    pending_tasks: 1,
    knowledge_gaps: 1,
    escalations: 1,
  },
};

describe("approval inbox response validation", () => {
  it("accepts complete triage and active-work payloads", () => {
    expect(parseTriageBucket(validTriage)).toEqual(validTriage);
    expect(parseApprovalTasks({ tasks: [{ id: "task-1", status: "pending" }] })).toEqual([
      { id: "task-1", status: "pending" },
    ]);
  });

  it("rejects incomplete success envelopes instead of reporting a false clear state", () => {
    expect(parseTriageBucket({ ...validTriage, escalations: undefined })).toBeNull();
    expect(parseTriageBucket({ ...validTriage, hot_leads: [{}] })).toBeNull();
    expect(parseTriageBucket({ ...validTriage, counts: { pending_tasks: -1 } })).toBeNull();
    expect(parseTriageBucket({ ...validTriage, counts: { pending_tasks: 1.5 } })).toBeNull();
    expect(parseApprovalTasks({})).toBeNull();
    expect(parseApprovalTasks({ tasks: [{ status: "pending" }] })).toBeNull();
  });

  it("accepts a legitimately empty response", () => {
    expect(
      parseTriageBucket({
        hot_leads: [],
        compliance: [],
        pending_tasks: [],
        knowledge_gaps: [],
        escalations: [],
      }),
    ).not.toBeNull();
    expect(parseApprovalTasks({ tasks: [] })).toEqual([]);
  });
});
