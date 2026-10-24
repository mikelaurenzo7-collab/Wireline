import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  callHappenedDetail,
  callHappenedLabel,
  classifyCallHappened,
  deriveCallEmailState,
} from "../src/lib/call-happened";
import { summarizeEmailReplyLedger } from "../src/lib/email-delivery";

const read = (path: string) => readFileSync(path, "utf8");

describe("deriveCallEmailState", () => {
  it("reports pending while a send email approval for the call is still active", () => {
    // The audit case: the live tool audit said sent, but an approval for the
    // same call is still outstanding, so the call must not claim "sent".
    expect(
      deriveCallEmailState({ liveAccepted: true, taskStatuses: ["pending"], executions: [] }),
    ).toBe("pending");
    expect(deriveCallEmailState({ taskStatuses: ["in_progress"] })).toBe("pending");
    expect(deriveCallEmailState({ taskStatuses: ["open"] })).toBe("pending");
  });

  it("reports sent from each real send record", () => {
    expect(deriveCallEmailState({ liveAccepted: true })).toBe("sent");
    expect(deriveCallEmailState({ taskStatuses: ["completed"] })).toBe("sent");
    expect(
      deriveCallEmailState({
        executions: [{ status: "completed", success: true, queued: false }],
      }),
    ).toBe("sent");
  });

  it("does not treat a queued draft execution as a send", () => {
    expect(
      deriveCallEmailState({
        executions: [{ status: "completed", success: true, queued: true }],
      }),
    ).toBeNull();
  });

  it("reports failed when the latest send evidence is a failed execution", () => {
    expect(deriveCallEmailState({ executions: [{ status: "failed", success: false }] })).toBe(
      "failed",
    );
    // A failed approval attempt whose draft was later withdrawn stays failed,
    // not pending and not sent.
    expect(
      deriveCallEmailState({
        taskStatuses: ["cancelled"],
        executions: [{ status: "failed", success: false }],
      }),
    ).toBe("failed");
  });

  it("prefers the recovered truth when a retry later succeeds", () => {
    expect(
      deriveCallEmailState({
        executions: [
          { status: "failed", success: false },
          { status: "completed", success: true, queued: false },
        ],
      }),
    ).toBe("sent");
  });

  it("stays silent when no email record exists for the call", () => {
    expect(deriveCallEmailState({})).toBeNull();
    expect(deriveCallEmailState({ taskStatuses: ["cancelled"] })).toBeNull();
  });
});

describe("classifyCallHappened email states", () => {
  it("shows a pending approval instead of sent, booked, or message taken", () => {
    const happened = classifyCallHappened({
      outcomeTag: "booked",
      emailState: "pending",
      messageTaken: true,
    });
    expect(happened).toBe("email_pending");
    expect(callHappenedLabel(happened)).toBe("Email pending");
    expect(callHappenedDetail(happened)).toContain("waiting for approval");
    expect(callHappenedDetail(happened)).toContain("has not been sent");
  });

  it("shows failed instead of claiming a send", () => {
    const happened = classifyCallHappened({ emailState: "failed" });
    expect(happened).toBe("email_failed");
    expect(callHappenedLabel(happened)).toBe("Email failed");
  });

  it("keeps sent for confirmed sends and the legacy accepted flag", () => {
    expect(classifyCallHappened({ emailState: "sent" })).toBe("email_sent");
    expect(classifyCallHappened({ emailAccepted: true })).toBe("email_sent");
    expect(callHappenedLabel("email_sent")).toBe("Email sent");
  });

  it("never claims delivery in any email label or detail", () => {
    for (const happened of ["email_sent", "email_pending", "email_failed"] as const) {
      expect(callHappenedLabel(happened)).not.toMatch(/deliver/i);
      expect(callHappenedDetail(happened)).not.toMatch(/deliver/i);
    }
  });
});

describe("summarizeEmailReplyLedger", () => {
  const sentRow = (key: string, messageId: string, at: string) => ({
    resourceId: key,
    metadata: { status: "sent", at, result: { message: { id: messageId } } },
  });

  it("collects confirmed sent message ids and the latest state", () => {
    const summary = summarizeEmailReplyLedger([
      sentRow("thread:op-2", "102", "2026-10-22T16:25:00.000Z"),
      sentRow("thread:op-1", "101", "2026-10-22T15:10:00.000Z"),
    ]);
    expect(summary.sentMessageIds).toEqual(["102", "101"]);
    expect(summary.latestStatus).toBe("sent");
    expect(summary.latestAt).toBe("2026-10-22T16:25:00.000Z");
  });

  it("lets the newest row per reply key win over an older confirmation", () => {
    const summary = summarizeEmailReplyLedger([
      { resourceId: "thread:op-1", metadata: { status: "processing", at: "t2" } },
      sentRow("thread:op-1", "101", "t1"),
    ]);
    expect(summary.sentMessageIds).toEqual([]);
    expect(summary.latestStatus).toBe("unresolved");
  });

  it("reflects the real latest send state across multiple sends", () => {
    const summary = summarizeEmailReplyLedger([
      { resourceId: "thread:op-2", metadata: { status: "failed", at: "t2" } },
      sentRow("thread:op-1", "101", "t1"),
    ]);
    expect(summary.latestStatus).toBe("failed");
    expect(summary.sentMessageIds).toEqual(["101"]);
  });

  it("maps the owner acknowledgement and empty ledgers", () => {
    expect(
      summarizeEmailReplyLedger([
        { resourceId: "thread:op-1", metadata: { status: "owner_acknowledged", at: "t1" } },
      ]).latestStatus,
    ).toBe("acknowledged");
    expect(summarizeEmailReplyLedger([])).toEqual({
      sentMessageIds: [],
      latestStatus: null,
      latestAt: null,
    });
  });
});

describe("email send truth wiring", () => {
  it("derives the call email state from approval and execution records", () => {
    const report = read("src/lib/call-report.ts");
    expect(report).toContain('eq(schema.followUpTasks.taskType, "send_email")');
    expect(report).toContain('"action.execution"');
    expect(report).toContain("deriveCallEmailState");
  });

  it("attaches ledger delivery status to both inbox message surfaces", () => {
    const outcomeRoutes = read("src/routes/email-outcome-routes.ts");
    expect(outcomeRoutes).toContain("loadEmailThreadDelivery");
    expect(outcomeRoutes).toContain("deliveryStatus");
    const emailRoutes = read("src/routes/email-routes.ts");
    expect(emailRoutes).toContain("loadEmailThreadDelivery");
    expect(emailRoutes).toContain("deliveryStatus");
  });

  it("renders the delivery status in the inbox thread", () => {
    const inbox = read("src/components/EmailInbox.tsx");
    expect(inbox).toContain("deliveryStatus");
    expect(inbox).toContain("Reply Not Sent");
  });
});
