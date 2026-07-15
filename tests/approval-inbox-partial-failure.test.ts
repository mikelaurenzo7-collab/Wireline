import { describe, expect, it } from "vitest";

import {
  resolveApprovalBucketItems,
  type FollowUpTaskRow,
  type TriageBucket,
} from "../src/components/ApprovalInbox";

const pendingTask: FollowUpTaskRow = {
  id: "task-1",
  task_type: "email_follow_up",
  description: "Send the promised recap",
};

describe("Approval Inbox partial data", () => {
  it("preserves pending tasks when the triage evidence endpoint is unavailable", () => {
    expect(resolveApprovalBucketItems("pending", null, [pendingTask])).toEqual([pendingTask]);
  });

  it("prefers the triage evidence queue when it is available", () => {
    const triageTask = { ...pendingTask, id: "triage-task" };
    const triage: TriageBucket = {
      pending_tasks: [triageTask],
      compliance: [],
      hot_leads: [],
      escalations: [],
      knowledge_gaps: [],
    };
    expect(resolveApprovalBucketItems("pending", triage, [pendingTask])).toEqual([triageTask]);
  });
});
