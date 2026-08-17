import { describe, expect, it } from "vitest";

import { parseAgentMailWebhookEvent } from "./agentmail-webhook";

describe("agentmail webhook payload", () => {
  it("reads inbound message fields from the AgentMail envelope", () => {
    const event = parseAgentMailWebhookEvent({
      event_type: "message.received",
      event_id: "evt_1",
      message: {
        message_id: "msg_1",
        thread_id: "thd_1",
        from: "Lead <lead@example.com>",
        subject: "Pricing",
        extracted_text: "Can we talk Thursday?",
        created_at: "2026-08-17T03:00:00Z",
      },
    });
    expect(event).toMatchObject({
      eventType: "message.received",
      messageId: "msg_1",
      threadId: "thd_1",
      from: "Lead <lead@example.com>",
      subject: "Pricing",
      snippet: "Can we talk Thursday?",
    });
  });

  it("rejects a payload with no event type", () => {
    expect(() => parseAgentMailWebhookEvent({ message: {} })).toThrow(/event type is missing/);
  });
});
