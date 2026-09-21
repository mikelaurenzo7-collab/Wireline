import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("SMS trust surface", () => {
  it("uses canonical conversation primitives and keeps lifecycle controls behind disclosure", () => {
    const sms = source("src/components/SmsThreads.tsx");
    const outcome = source("src/components/SmsOutcomePanel.tsx");
    expect(sms).toContain("ConversationMessage");
    expect(sms).toContain("StatusNotice");
    expect(sms).toContain('channel="text"');
    expect(sms).toContain('import SmsOutcomePanel from "./SmsOutcomePanel"');
    expect(sms).toContain("<details");
    expect(sms).toContain("<SmsOutcomePanel");
    expect(outcome).toContain("ConversationActivity");
  });

  it("retains optimistic delivery, ambiguous-provider, and rollback semantics", () => {
    const sms = source("src/components/SmsThreads.tsx");
    expect(sms).toContain("optimistic-${Date.now()}");
    expect(sms).toContain("setMessages((current) => [...current, optimistic])");
    expect(sms).toContain("filter((message) => message.id !== optimistic.id)");
    expect(sms).toContain("setReply(body)");
    expect(sms).toContain("SMS_PROVIDER_OUTCOME_AMBIGUOUS");
    expect(sms).toContain("SMS status unknown. Do not resend");
  });

  it("retains tenant-scoped SMS endpoints and outcome ownership", () => {
    const sms = source("src/components/SmsThreads.tsx");
    const outcome = source("src/components/SmsOutcomePanel.tsx");
    expect(sms).toMatch(
      /agentId\s*\? `\/api\/sms\/threads\?agent_id=\$\{encodeURIComponent\(agentId\)\}`/,
    );
    expect(sms).toContain("/api/sms/threads/${threadId}/messages");
    expect(sms).toContain("/api/sms/threads/${threadId}/reply");
    expect(outcome).toContain("/api/sms/threads/${threadId}/outcome");
    expect(outcome).toContain('onClick={() => void setOutcome("escalated", true)}');
    expect(outcome).toContain("A human follow-up is now in Approvals.");
    const operations = source("src/lib/conversation-outcome-operations.ts");
    expect(outcome).toContain("smsOutcomeOperations.save(threadId, nextStatus, createHandoff)");
    expect(operations).toContain('createOutcomeOperations("sms")');
    expect(operations).toContain("body.handoff_task_id");
  });
});
