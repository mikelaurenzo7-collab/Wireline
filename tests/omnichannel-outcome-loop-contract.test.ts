import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const semantics = source("src/lib/conversation-outcome.ts");
const operatorWorkStatus = source("src/lib/operator-work-status.ts");
const emailRoute = source("src/routes/email-outcome-routes.ts");
const smsRoute = source("src/routes/sms-outcome-routes.ts");
const operatorRoute = source("src/routes/operator-task-routes.ts");
const registry = source("src/server/register-api-routes.ts");
const approvals = source("src/components/ApprovalInbox.tsx");
const emailInbox = source("src/components/EmailInbox.tsx");
const smsThreads = source("src/components/SmsThreads.tsx");
const smsPanel = source("src/components/SmsOutcomePanel.tsx");
const actionTypes = source("src/lib/action-types.ts");

describe("omnichannel outcome loop", () => {
  it("shares one explicit outcome and active-handoff vocabulary across channels", () => {
    expect(semantics).toContain('"open",');
    expect(semantics).toContain('"waiting",');
    expect(semantics).toContain('"escalated",');
    expect(semantics).toContain('"booked",');
    expect(semantics).toContain('"resolved",');
    expect(operatorWorkStatus).toContain(
      'ACTIVE_OPERATOR_TASK_STATUSES = ["pending", "open", "in_progress"]',
    );
    expect(semantics).toContain(
      "ACTIVE_HANDOFF_TASK_STATUSES = ACTIVE_OPERATOR_TASK_STATUSES",
    );
    expect(semantics).toContain("handoffAdvisoryLockKey(");
    expect(semantics).toContain('if (status === "booked" || status === "resolved") return "completed"');
    expect(semantics).toContain('return "cancelled"');
  });

  it("keeps email conversation state and durable human handoff state synchronized", () => {
    expect(emailRoute).toContain("conversationOutcomeSchema");
    expect(emailRoute).toContain("ACTIVE_HANDOFF_TASK_STATUSES");
    expect(emailRoute).toContain('eq(schema.followUpTasks.taskType, HUMAN_HANDOFF_TASK_TYPE)');
    expect(emailRoute).toContain("handoffTaskStatusForOutcome(status)");
    expect(emailRoute).toContain("handoffResolutionNote(\"email\", status)");
    expect(emailRoute).toContain("pg_advisory_xact_lock");
    expect(emailRoute).toContain("handoffAdvisoryLockKey(req.user.id, EMAIL_HANDOFF_SOURCE_TYPE, thread.id)");
    expect(emailRoute).toContain("touchNavCounts(req.user.id)");
    expect(emailInbox).toContain('updated.status === "escalated"');
    expect(emailInbox).toContain('detail?.handoff && selectedThread.status === "escalated"');
  });

  it("gives SMS the same evidence-to-outcome-to-handoff lifecycle without changing reply delivery", () => {
    expect(smsRoute).toContain('"/api/sms/threads/:id/outcome"');
    expect(smsRoute).toContain("conversationOutcomeSchema");
    expect(smsRoute).toContain('const SMS_HANDOFF_SOURCE_TYPE = "sms_thread"');
    expect(smsRoute).toContain('eq(schema.followUpTasks.taskType, HUMAN_HANDOFF_TASK_TYPE)');
    expect(smsRoute).toContain("handoffTaskStatusForOutcome(status)");
    expect(smsRoute).toContain("pg_advisory_xact_lock");
    expect(smsRoute).toContain("handoffAdvisoryLockKey(req.user.id, SMS_HANDOFF_SOURCE_TYPE, thread.id)");
    expect(smsRoute).toContain("touchNavCounts(req.user.id)");
    expect(smsThreads).toContain('import SmsOutcomePanel from "./SmsOutcomePanel"');
    expect(smsThreads).toContain("<SmsOutcomePanel");
    expect(smsThreads).toContain('authFetch(`/api/sms/threads/${threadId}/reply`');
    expect(smsPanel).toContain('authFetch(`/api/sms/threads/${threadId}/outcome`');
    expect(smsPanel).toContain('void setOutcome("waiting")');
    expect(smsPanel).toContain('void setOutcome("booked")');
    expect(smsPanel).toContain('void setOutcome("escalated", true)');
    expect(smsPanel).toContain('void setOutcome("resolved")');
    expect(smsPanel).toContain('void setOutcome("open")');
  });

  it("treats human handoffs as operator work instead of unsupported AI actions", () => {
    expect(actionTypes).not.toContain('"human_handoff"');
    expect(operatorRoute).toContain('const HUMAN_HANDOFF_TASK_TYPE = "human_handoff"');
    expect(operatorRoute).toContain('if (req.query.status !== "active") return next()');
    expect(operatorRoute).toContain("inArray(schema.followUpTasks.status, [...ACTIVE_HANDOFF_TASK_STATUSES])");
    expect(operatorRoute).toContain('task.taskType !== HUMAN_HANDOFF_TASK_TYPE) return next()');
    expect(operatorRoute).toContain('status: "resolved"');
    expect(operatorRoute).toContain('status: "open"');
    expect(operatorRoute).toContain('throw AppError.fromHttpStatus(409, "This handoff changed in another session.")');
    expect(operatorRoute).toContain(".returning({ id: schema.followUpTasks.id })");
    expect(operatorRoute).not.toContain("emitServerProductEventOnce");
    expect(operatorRoute).not.toContain("first_next_action_approved");
    expect(approvals).toContain('authFetch("/api/Assistants/tasks?status=active")');
    expect(approvals).toContain('rawTaskType(task) === "human_handoff"');
    expect(approvals).toContain('{manualHandoff ? "Complete" : "Approve"}');
    expect(approvals).toContain('{manualHandoff ? "Dismiss" : "Reject"}');
    expect(approvals).toContain("if (!manualHandoff) {");
  });

  it("keeps actionable work usable when triage enrichment is degraded", () => {
    expect(approvals).toContain("const pendingTasks = useMemo(");
    expect(approvals).toContain("const complianceTasks = useMemo(");
    expect(approvals).toContain('case "pending":\n        return pendingTasks;');
    expect(approvals).toContain('case "compliance":\n        return complianceTasks;');
    expect(approvals).not.toContain("if (!triage) return []");
    expect(approvals).toContain('authFetch("/api/triage").catch(() => null)');
    expect(approvals).toContain("setTriageUnavailable(!triageReady)");
    expect(approvals).toContain("Active operator work is still current.");
  });

  it("registers shadow routes before their broader legacy owners", () => {
    expect(registry).toContain('import operatorTaskRouter from "../routes/operator-task-routes"');
    expect(registry).toContain('import smsOutcomeRouter from "../routes/sms-outcome-routes"');
    const operatorMount = registry.indexOf("app.use(operatorTaskRouter);");
    const fleetMount = registry.indexOf("app.use(fleetRouter);");
    const smsOutcomeMount = registry.indexOf("app.use(smsOutcomeRouter);");
    const smsMount = registry.indexOf("app.use(smsRouter);");
    expect(operatorMount).toBeGreaterThan(-1);
    expect(operatorMount).toBeLessThan(fleetMount);
    expect(smsOutcomeMount).toBeGreaterThan(-1);
    expect(smsOutcomeMount).toBeLessThan(smsMount);
  });
});
