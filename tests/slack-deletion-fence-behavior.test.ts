import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decryptSecret: vi.fn(),
  dispatchWebhook: vi.fn(),
  fetchWithTimeout: vi.fn(),
  fence: vi.fn(),
  livePolicy: vi.fn(),
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  select: vi.fn(),
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: mocks.select },
  log: mocks.log,
  fetchWithTimeout: mocks.fetchWithTimeout,
}));
vi.mock("../src/lib/secret-vault", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: mocks.livePolicy,
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: mocks.fence,
}));
vi.mock("../src/lib/webhook-helpers", () => ({ dispatchWebhook: mocks.dispatchWebhook }));

import { postMessage } from "../src/lib/slack-service";

function connectedSlackQuery() {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi
          .fn()
          .mockResolvedValue([
            { id: "connection-1", accessToken: "encrypted-token", metadata: {} },
          ]),
      })),
    })),
  };
}

describe("Slack provider deletion fence", () => {
  let retained: boolean | undefined;

  beforeEach(() => {
    retained = undefined;
    vi.clearAllMocks();
    mocks.livePolicy.mockResolvedValue({ allowed: true, environment: "production" });
    mocks.select.mockImplementation(connectedSlackQuery);
    mocks.decryptSecret.mockReturnValue("slack-token");
    mocks.dispatchWebhook.mockResolvedValue(undefined);
    mocks.fence.mockImplementation(async (input: any) => {
      const result = await input.perform();
      retained = input.retainOnSuccess?.(result) ?? false;
      return { performed: true, result };
    });
  });

  it("suppresses token lookup and provider work when terminal deletion wins", async () => {
    mocks.fence.mockResolvedValue({
      performed: false,
      reason: "account_erased_or_terminal_deletion",
    });

    await expect(postMessage("tenant-1", "channel-1", "hello")).resolves.toBe(false);

    expect(mocks.fence).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "tenant-1", operation: "slack_message_send" }),
    );
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("retains accepted Slack work and emits its nested webhook under the same fence", async () => {
    mocks.fetchWithTimeout.mockResolvedValue({
      json: vi.fn().mockResolvedValue({ ok: true, ts: "1712345.678" }),
    });

    await expect(postMessage("tenant-1", "channel-1", "hello")).resolves.toBe(true);

    expect(retained).toBe(true);
    expect(mocks.dispatchWebhook).toHaveBeenCalledWith("tenant-1", "slack.message_sent", {
      channel: "channel-1",
      ts: "1712345.678",
      ok: true,
    });
  });

  it("releases a definite Slack rejection but retains an ambiguous transport failure", async () => {
    mocks.fetchWithTimeout.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue({ ok: false, error: "channel_not_found" }),
    });
    await expect(postMessage("tenant-1", "channel-1", "hello")).resolves.toBe(false);
    expect(retained).toBe(false);

    mocks.fetchWithTimeout.mockRejectedValueOnce(new Error("socket closed"));
    await expect(postMessage("tenant-1", "channel-1", "hello")).resolves.toBe(false);
    expect(retained).toBe(true);
    expect(mocks.dispatchWebhook).not.toHaveBeenCalled();
  });
});
