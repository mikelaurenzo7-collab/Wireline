import { describe, expect, it } from "vitest";

import { agentMailSuppressionReason, parseAgentMailWebhookEvent } from "./agentmail-webhook";

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
        timestamp: "2026-08-17T03:00:00Z",
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
    expect(event.receivedAt.toISOString()).toBe("2026-08-17T03:00:00.000Z");
  });

  it("uses AgentMail preview and safely derives text for HTML-only inbound mail", () => {
    const preview = parseAgentMailWebhookEvent({
      event_type: "message.received",
      message: {
        message_id: "msg_preview",
        from: "lead@example.com",
        preview: "A concise preview",
        html: "<p>Ignored because preview is present</p>",
      },
    });
    expect(preview.snippet).toBe("A concise preview");

    const htmlOnly = parseAgentMailWebhookEvent({
      event_type: "message.received",
      message: {
        message_id: "msg_html",
        from: "lead@example.com",
        html: "<style>p { color: red; }</style><p>Hello <strong>there</strong> &amp; welcome</p>",
      },
    });
    expect(htmlOnly.snippet).toBe("Hello there & welcome");
  });

  it("reads bounced recipients from the event-specific bounce payload", () => {
    const event = parseAgentMailWebhookEvent({
      event_type: "message.bounced",
      event_id: "evt_bounce",
      bounce: {
        message_id: "msg_bounce",
        thread_id: "thd_bounce",
        timestamp: "2026-08-17T03:05:00Z",
        recipients: [{ address: "invalid@example.com", status: "bounced" }],
      },
    });
    expect(event).toMatchObject({
      eventType: "message.bounced",
      messageId: "msg_bounce",
      threadId: "thd_bounce",
      bounceRecipient: "invalid@example.com",
    });
    expect(agentMailSuppressionReason(event.eventType)).toBe("agentmail_bounced");
  });

  it("reads complaint recipients but never invents a recipient for rejected sends", () => {
    const complaint = parseAgentMailWebhookEvent({
      event_type: "message.complained",
      complaint: {
        message_id: "msg_complaint",
        recipients: ["complainer@example.com"],
      },
    });
    expect(complaint.bounceRecipient).toBe("complainer@example.com");
    expect(agentMailSuppressionReason(complaint.eventType)).toBe("agentmail_complained");

    const rejected = parseAgentMailWebhookEvent({
      event_type: "message.rejected",
      reject: {
        message_id: "msg_rejected",
        reason: "Invalid recipient address",
      },
    });
    expect(rejected.bounceRecipient).toBeNull();
    expect(rejected.rejectionReason).toBe("Invalid recipient address");
    expect(agentMailSuppressionReason(rejected.eventType)).toBeNull();
  });

  it("rejects a payload with no event type", () => {
    expect(() => parseAgentMailWebhookEvent({ message: {} })).toThrow(/event type is missing/);
  });
});
