import { describe, expect, it, vi } from "vitest";

import { AppError } from "../src/lib/api-error";

const liveActionGuard = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: liveActionGuard,
}));

import { assertOAuthProviderConnectAllowed } from "../src/lib/oauth-connect-environment";

async function attemptProviderExchange(userId: unknown, exchange: () => Promise<string>) {
  await assertOAuthProviderConnectAllowed(userId, "Test provider");
  return exchange();
}

describe("integration OAuth account-environment fence", () => {
  it.each([
    "Salesforce",
    "HubSpot",
    "Slack",
    "X",
    "Zoom",
    "Apollo",
    "Meta",
    "Shopify",
    "Square",
    "microsoft_teams",
    "microsoft_excel",
    "Google Sheets",
  ])("rejects new %s grants before provider or account work", async (provider) => {
    liveActionGuard.mockReset();
    await expect(assertOAuthProviderConnectAllowed("owner", provider)).rejects.toMatchObject({
      status: 410,
      code: "CONNECTION_RETIRED",
    });
    expect(liveActionGuard).not.toHaveBeenCalled();
  });

  it.each(["Google", "Microsoft", "Yahoo"])(
    "preserves %s mail/calendar OAuth",
    async (provider) => {
      liveActionGuard.mockReset();
      liveActionGuard.mockResolvedValueOnce(undefined);
      await expect(assertOAuthProviderConnectAllowed("owner", provider)).resolves.toBe("owner");
      expect(liveActionGuard).toHaveBeenCalledWith("owner", `${provider} OAuth connect`);
    },
  );

  it.each([
    ["demo", 403, "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED"],
    ["test", 403, "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED"],
    ["missing", 503, "ACCOUNT_ENVIRONMENT_UNAVAILABLE"],
  ] as const)(
    "blocks a %s account before provider token exchange",
    async (environment, status, code) => {
      liveActionGuard.mockReset();
      liveActionGuard.mockRejectedValueOnce(new AppError(status, code, `${environment} blocked`));
      const exchange = vi.fn(async () => "provider-token");

      await expect(attemptProviderExchange(`${environment}-user`, exchange)).rejects.toMatchObject({
        status,
        code,
      });

      expect(liveActionGuard).toHaveBeenCalledWith(
        `${environment}-user`,
        "Test provider OAuth connect",
      );
      expect(exchange).not.toHaveBeenCalled();
    },
  );

  it("fails closed on an account-environment lookup error", async () => {
    liveActionGuard.mockReset();
    liveActionGuard.mockRejectedValueOnce(new Error("database unavailable"));
    const exchange = vi.fn(async () => "provider-token");

    await expect(attemptProviderExchange("unknown-user", exchange)).rejects.toThrow(
      "database unavailable",
    );
    expect(exchange).not.toHaveBeenCalled();
  });

  it("allows an explicit production account to reach the provider", async () => {
    liveActionGuard.mockReset();
    liveActionGuard.mockResolvedValueOnce(undefined);
    const exchange = vi.fn(async () => "provider-token");

    await expect(attemptProviderExchange("production-user", exchange)).resolves.toBe(
      "provider-token",
    );
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing authenticated account before policy or provider work", async () => {
    liveActionGuard.mockReset();
    const exchange = vi.fn(async () => "provider-token");

    await expect(attemptProviderExchange(undefined, exchange)).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(liveActionGuard).not.toHaveBeenCalled();
    expect(exchange).not.toHaveBeenCalled();
  });
});
