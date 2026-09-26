import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./server-context", () => ({
  fetchWithTimeout: request,
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { AGENTMAIL_WEBHOOK_EVENT_TYPES, ensureAgentMailWebhook } from "./agentmail-mail";

const accountId = "11111111-1111-4111-8111-111111111111";
const url = `https://botbound.app/api/webhooks/agentmail/${accountId}`;
const input = { apiKey: "am_test", inboxId: "bot@botbound.app", accountId, hasStoredSecret: true };
const response = (status: number, body: unknown) => ({
  status,
  text: async () => JSON.stringify(body),
});
const webhook = {
  webhook_id: "current",
  url,
  enabled: true,
  inbox_ids: [input.inboxId],
  event_types: [...AGENTMAIL_WEBHOOK_EVENT_TYPES],
};

beforeEach(() => {
  request.mockReset();
  vi.stubEnv("APP_URL", "https://botbound.app");
});
afterEach(() => vi.unstubAllEnvs());

describe("AgentMail reconnect delivery guarantees", () => {
  it("refreshes the signing secret even when an older secret is already stored", async () => {
    request
      .mockResolvedValueOnce(response(200, { webhooks: [webhook] }))
      .mockResolvedValueOnce(response(200, { ...webhook, secret: "whsec_current" }));

    await expect(ensureAgentMailWebhook(input)).resolves.toEqual({
      webhookId: "current",
      secret: "whsec_current",
    });
    expect(request.mock.calls[1][0]).toBe("https://api.agentmail.to/v0/webhooks/current");
  });

  it("repairs partial subscriptions without removing other subscribed events or inboxes", async () => {
    request
      .mockResolvedValueOnce(
        response(200, {
          webhooks: [
            {
              ...webhook,
              inbox_ids: ["other@botbound.app"],
              event_types: ["domain.verified"],
              secret: "whsec_current",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          ...webhook,
          inbox_ids: ["other@botbound.app", input.inboxId],
          event_types: ["domain.verified", ...AGENTMAIL_WEBHOOK_EVENT_TYPES],
          secret: "whsec_current",
        }),
      );

    await expect(ensureAgentMailWebhook(input)).resolves.toEqual({
      webhookId: "current",
      secret: "whsec_current",
    });
    expect(request.mock.calls[1][1].method).toBe("PATCH");
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({
      add_inbox_ids: [input.inboxId],
      event_types: ["domain.verified", ...AGENTMAIL_WEBHOOK_EVENT_TYPES],
    });
    expect(request.mock.calls.some((call) => call[1]?.method === "DELETE")).toBe(false);
  });

  it("keeps existing deliveries intact when replacement secret recovery fails", async () => {
    const legacy = {
      webhook_id: "legacy",
      client_id: "wireline-mailbox-webhook",
      url: url.replace("botbound.app", "botbound.me"),
    };
    request.mockImplementation(async (target: string, options?: RequestInit) => {
      if (target.includes("?limit=")) return response(200, { webhooks: [legacy, webhook] });
      if (options?.method === "DELETE") return response(204, {});
      return response(503, { message: "temporarily unavailable" });
    });

    await expect(ensureAgentMailWebhook({ ...input, hasStoredSecret: false })).rejects.toThrow();
    expect(request.mock.calls.some((call) => call[1]?.method === "DELETE")).toBe(false);
  });

  it("does not adopt a webhook on another port as the production receiver", async () => {
    request
      .mockResolvedValueOnce(
        response(200, {
          webhooks: [
            { ...webhook, url: url.replace(".app/", ".app:8443/"), secret: "whsec_other_port" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response(201, { ...webhook, webhook_id: "created", secret: "whsec_created" }),
      );

    await expect(ensureAgentMailWebhook(input)).resolves.toEqual({
      webhookId: "created",
      secret: "whsec_created",
    });
    expect(request.mock.calls[1][1].method).toBe("POST");
  });

  it("does not report a disabled subscription as a working delivery channel", async () => {
    request.mockResolvedValueOnce(
      response(200, { webhooks: [{ ...webhook, enabled: false, secret: "whsec_current" }] }),
    );
    await expect(ensureAgentMailWebhook(input)).rejects.toThrow(/disabled/i);
  });
});
