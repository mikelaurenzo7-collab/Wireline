import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./server-context", () => ({
  fetchWithTimeout: request,
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  AGENTMAIL_WEBHOOK_EVENT_TYPES,
  agentMailWebhookClientId,
  deleteAgentMailWebhooksForAccount,
  ensureAgentMailWebhook,
} from "./agentmail-mail";

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

  it("retains the stored secret when the same valid webhook omits it from list and GET", async () => {
    request
      .mockResolvedValueOnce(response(200, { webhooks: [webhook] }))
      .mockResolvedValueOnce(response(200, webhook));

    await expect(ensureAgentMailWebhook(input)).resolves.toEqual({
      webhookId: "current",
      secret: null,
    });
    expect(request.mock.calls).toHaveLength(2);
  });

  it("requires a provider secret when the mailbox has no saved secret", async () => {
    request
      .mockResolvedValueOnce(response(200, { webhooks: [webhook] }))
      .mockResolvedValueOnce(response(200, webhook));

    await expect(ensureAgentMailWebhook({ ...input, hasStoredSecret: false })).rejects.toThrow(
      /signing secret/i,
    );
  });

  it("does not use the stored fallback when GET reveals a different subscription", async () => {
    request
      .mockResolvedValueOnce(response(200, { webhooks: [webhook] }))
      .mockResolvedValueOnce(response(200, { ...webhook, inbox_ids: ["other@botbound.app"] }));

    await expect(ensureAgentMailWebhook(input)).rejects.toThrow();
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

  it.each([{ enabled: false }, { url: "https://other.example/webhook" }])(
    "removes a newly created hook that fails validation: %j",
    async (invalid) => {
      request
        .mockResolvedValueOnce(response(200, { webhooks: [] }))
        .mockResolvedValueOnce(
          response(201, { ...webhook, webhook_id: "created", secret: "whsec_new", ...invalid }),
        )
        .mockResolvedValueOnce(response(204, {}));

      await expect(ensureAgentMailWebhook(input)).rejects.toThrow();
      expect(request.mock.calls[2]?.[0]).toBe("https://api.agentmail.to/v0/webhooks/created");
      expect(request.mock.calls[2]?.[1].method).toBe("DELETE");
    },
  );

  it("cleans up only the new hook when its secret lookup fails", async () => {
    request
      .mockResolvedValueOnce(response(200, { webhooks: [] }))
      .mockResolvedValueOnce(response(201, { ...webhook, webhook_id: "created" }))
      .mockResolvedValueOnce(response(503, { message: "temporarily unavailable" }))
      .mockResolvedValueOnce(response(204, {}));

    await expect(ensureAgentMailWebhook(input)).rejects.toThrow();
    expect(request.mock.calls[3]?.[0]).toBe("https://api.agentmail.to/v0/webhooks/created");
    expect(request.mock.calls[3]?.[1].method).toBe("DELETE");
  });

  it("uses a new destination-specific idempotency key during a domain migration", async () => {
    const legacy = {
      ...webhook,
      webhook_id: "legacy",
      url: url.replace("botbound.app", "botbound.me"),
      client_id: agentMailWebhookClientId(accountId),
      secret: "whsec_legacy",
    };
    request.mockImplementation(async (target: string, options?: RequestInit) => {
      if (target.includes("?limit=")) return response(200, { webhooks: [legacy] });
      if (options?.method === "POST") {
        const posted = JSON.parse(String(options.body));
        return response(
          200,
          posted.client_id === legacy.client_id
            ? legacy
            : { ...webhook, webhook_id: "created", secret: "whsec_new" },
        );
      }
      return response(204, {});
    });

    await expect(ensureAgentMailWebhook(input)).resolves.toEqual({
      webhookId: "created",
      secret: "whsec_new",
    });
    expect(request.mock.calls.some((call) => call[1]?.method === "DELETE")).toBe(false);
    const posted = JSON.parse(request.mock.calls[1][1].body);
    expect(posted.client_id).not.toBe(legacy.client_id);
    expect(posted.client_id).toBe(agentMailWebhookClientId(accountId, url));
  });

  it("never rolls back a preexisting hook returned by an idempotent create", async () => {
    const legacy = {
      ...webhook,
      webhook_id: "legacy",
      url: url.replace("botbound.app", "botbound.me"),
      client_id: agentMailWebhookClientId(accountId),
      secret: "whsec_legacy",
    };
    request
      .mockResolvedValueOnce(response(200, { webhooks: [legacy] }))
      .mockResolvedValueOnce(response(200, legacy))
      .mockResolvedValueOnce(response(204, {}));

    await expect(ensureAgentMailWebhook(input)).rejects.toThrow();
    expect(request.mock.calls.some((call) => call[1]?.method === "DELETE")).toBe(false);
  });

  it("rolls back a newly returned id even when its URL is missing", async () => {
    request
      .mockResolvedValueOnce(response(200, { webhooks: [] }))
      .mockResolvedValueOnce(response(200, { webhook_id: "created" }))
      .mockResolvedValueOnce(response(204, {}));

    await expect(ensureAgentMailWebhook(input)).rejects.toThrow();
    expect(request.mock.calls[2]?.[0]).toBe("https://api.agentmail.to/v0/webhooks/created");
    expect(request.mock.calls[2]?.[1].method).toBe("DELETE");
  });

  it("disconnects destination-specific account hooks without touching another account", async () => {
    request
      .mockResolvedValueOnce(
        response(200, {
          webhooks: [
            {
              ...webhook,
              url: "https://old.example/hook",
              client_id: `${agentMailWebhookClientId(accountId)}:destination-key`,
            },
            {
              ...webhook,
              webhook_id: "other",
              url: "https://old.example/other",
              client_id: `${agentMailWebhookClientId("other-account")}:destination-key`,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response(204, {}));

    await deleteAgentMailWebhooksForAccount({ apiKey: input.apiKey, accountId });
    expect(request.mock.calls).toHaveLength(2);
    expect(request.mock.calls[1][0]).toBe("https://api.agentmail.to/v0/webhooks/current");
  });

  it("retires only owned duplicates after the selected signing secret has been persisted", async () => {
    request
      .mockResolvedValueOnce(
        response(200, {
          webhooks: [
            webhook,
            { ...webhook, webhook_id: "duplicate" },
            {
              ...webhook,
              webhook_id: "legacy",
              url: url.replace("botbound.app", "botbound.me"),
              client_id: agentMailWebhookClientId(accountId),
            },
            { ...webhook, webhook_id: "other", url: "https://other.example/webhook" },
          ],
        }),
      )
      .mockResolvedValue(response(204, {}));

    await deleteAgentMailWebhooksForAccount({
      apiKey: input.apiKey,
      accountId,
      keepWebhookId: "current",
    });
    expect(
      request.mock.calls.filter((call) => call[1]?.method === "DELETE").map((call) => call[0]),
    ).toEqual([
      "https://api.agentmail.to/v0/webhooks/duplicate",
      "https://api.agentmail.to/v0/webhooks/legacy",
    ]);
  });

  it("adopts the same enabled current hook regardless of duplicate list order", async () => {
    const first = { ...webhook, webhook_id: "a", secret: "whsec_a" };
    const second = { ...webhook, webhook_id: "b", secret: "whsec_b" };
    const disabled = { ...webhook, webhook_id: "0", enabled: false };
    for (const webhooks of [
      [disabled, second, first],
      [first, second, disabled],
    ]) {
      request.mockResolvedValueOnce(response(200, { webhooks }));
      await expect(ensureAgentMailWebhook(input)).resolves.toEqual({
        webhookId: "a",
        secret: "whsec_a",
      });
    }
  });

  it.each([
    { webhook_id: "missing" },
    { enabled: false },
    { url: "https://other.example/webhook" },
  ])("keeps previous deliveries when the retained hook is not confirmed: %j", async (invalid) => {
    request.mockResolvedValueOnce(
      response(200, {
        webhooks: [
          { ...webhook, ...invalid },
          { ...webhook, webhook_id: "older" },
        ],
      }),
    );

    await expect(
      deleteAgentMailWebhooksForAccount({
        apiKey: input.apiKey,
        accountId,
        keepWebhookId: "current",
      }),
    ).rejects.toThrow(/previous subscriptions were retained/);
    expect(request.mock.calls.some((call) => call[1]?.method === "DELETE")).toBe(false);
  });
});
