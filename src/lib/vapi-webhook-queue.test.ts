import { describe, expect, it } from "vitest";
import { resolveVapiWebhookType, shouldQueueWebhook } from "./vapi-webhook-queue";

describe("resolveVapiWebhookType", () => {
  it("prefers explicit webhookType on the job payload", () => {
    expect(
      resolveVapiWebhookType({
        webhookType: "end-of-call-report",
        payload: { message: { type: "status-update" } },
        agentId: "a",
        userId: "u",
        webhookAgentId: "a",
      }),
    ).toBe("end-of-call-report");
  });

  it("falls back to nested message.type", () => {
    expect(
      resolveVapiWebhookType({
        payload: { message: { type: "conversation-update" } },
      }),
    ).toBe("conversation-update");
  });
});

describe("shouldQueueWebhook", () => {
  it("queues end-of-call-report for async processing", () => {
    expect(shouldQueueWebhook("end-of-call-report")).toBe(true);
  });

  it("does not queue assistant-request", () => {
    expect(shouldQueueWebhook("assistant-request")).toBe(false);
  });
});
