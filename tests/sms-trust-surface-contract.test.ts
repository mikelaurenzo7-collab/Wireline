import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = () => readFileSync(resolve(root, "src/components/SmsThreads.tsx"), "utf8");

describe("SMS trust surface", () => {
  it("uses canonical conversation and lifecycle primitives", () => {
    const sms = source();
    expect(sms).toContain("ConversationMessage");
    expect(sms).toContain("ConversationActivity");
    expect(sms).toContain("StatusNotice");
    expect(sms).toContain('channel="text"');
  });

  it("retains optimistic delivery and rollback semantics", () => {
    const sms = source();
    expect(sms).toContain("optimistic-${Date.now()}");
    expect(sms).toContain("setMessages((current) => [...current, optimistic])");
    expect(sms).toContain("filter((message) => message.id !== optimistic.id)");
    expect(sms).toContain("setReply(body)");
  });

  it("retains tenant SMS endpoint contracts and compliance disclosure", () => {
    const sms = source();
    expect(sms).toContain('authFetch("/api/sms/threads")');
    expect(sms).toContain("/api/sms/threads/${threadId}/messages");
    expect(sms).toContain("/api/sms/threads/${threadId}/reply");
    expect(sms).toContain("STOP keyword");
    expect(sms).toContain("auto-honored");
  });
});
