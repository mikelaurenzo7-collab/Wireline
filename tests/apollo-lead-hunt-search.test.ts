import { afterEach, describe, expect, it, vi } from "vitest";

const quietLog = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function providerResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: vi.fn().mockResolvedValue(body),
  };
}

function tenantLookup(rows: Record<string, unknown>[] = []) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return { select: vi.fn(() => ({ from })) };
}

function allowProductionApollo() {
  vi.doMock("../src/lib/account-environment-policy", () => ({
    liveExternalActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
    externalEntityActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
  }));
}

describe("Apollo Lead Hunt targeting", () => {
  it("resolves saved industry labels to organizations before requesting phone-bearing people", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse({ organizations: [{ id: "org-1" }, { id: "org-2" }] }),
      )
      .mockResolvedValueOnce(
        providerResponse({
          people: [
            {
              id: "person-1",
              first_name: "Avery",
              last_name_obfuscated: "St***",
              title: "Owner",
              organization: { name: "Northstar Roofing" },
            },
            {
              id: "person-2",
              first_name: "No",
              last_name_obfuscated: "Ph***",
              title: "Owner",
              organization: { name: "Silent Roofing" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        providerResponse({
          matches: [
            {
              id: "person-1",
              first_name: "Avery",
              last_name: "Stone",
              title: "Owner",
              email: "avery@northstar.example",
              email_status: "verified",
              organization: { name: "Northstar Roofing", phone: "+13125550101" },
            },
            {
              id: "person-2",
              first_name: "No",
              last_name: "Phone",
              title: "Owner",
              organization: { name: "Silent Roofing" },
            },
          ],
        }),
      );
    vi.stubEnv("APOLLO_API_KEY", "test-apollo-key");
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: {},
      log: quietLog,
      fetchWithTimeout: vi.fn(),
    }));
    vi.doMock("../src/lib/account-environment-policy", () => ({
      liveExternalActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
      externalEntityActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
    }));

    const { searchLeads } = await import("../src/lib/apollo-service");
    const leads = await searchLeads({
      titles: ["Owner"],
      industries: ["Roofing"],
      states: ["IL"],
      employee_ranges: ["1,10"],
      limit: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/mixed_companies/search");
    const organizationUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(organizationUrl.searchParams.getAll("q_organization_keyword_tags[]")).toEqual([
      "Roofing",
    ]);
    expect(organizationUrl.searchParams.getAll("organization_num_employees_ranges[]")).toEqual([
      "1,10",
    ]);
    expect(organizationUrl.searchParams.get("per_page")).toBe("100");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/mixed_people/api_search");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      person_titles: ["Owner"],
      organization_ids: ["org-1", "org-2"],
      organization_num_employees_ranges: ["1,10"],
    });
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/people/bulk_match");
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      details: [{ id: "person-1" }, { id: "person-2" }],
    });
    expect(leads).toEqual([
      expect.objectContaining({
        apollo_id: "person-1",
        first_name: "Avery",
        phone: "+13125550101",
        phone_source: "organization",
        company: "Northstar Roofing",
      }),
    ]);
  });

  it("uses Apollo's current OAuth route and least-privilege Lead Hunt scopes", async () => {
    vi.stubEnv("APOLLO_CLIENT_ID", "botbound-client");
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: {},
      log: quietLog,
      fetchWithTimeout: vi.fn(),
    }));

    const { getApolloAuthUrl } = await import("../src/lib/apollo-service");
    const url = getApolloAuthUrl("https://botbound.me/api/oauth/apollo/callback", "state-1");

    expect(url).toContain("https://app.apollo.io/#/oauth/authorize?");
    expect(url).toContain("mixed_people_api_search");
    expect(url).toContain("people_bulk_match");
    expect(url).toContain("read_user_profile");
  });

  it("does not broaden an industry-targeted search when no organizations match", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(providerResponse({ organizations: [] }));
    vi.stubEnv("APOLLO_API_KEY", "test-apollo-key");
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: {},
      log: quietLog,
      fetchWithTimeout: vi.fn(),
    }));
    vi.doMock("../src/lib/account-environment-policy", () => ({
      liveExternalActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
      externalEntityActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
    }));

    const { searchLeads } = await import("../src/lib/apollo-service");
    await expect(searchLeads({ titles: ["Owner"], industries: ["Roofing"] })).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("checks the account environment before hydrating Apollo readiness", async () => {
    const select = vi.fn();
    vi.stubEnv("APOLLO_API_KEY", "test-apollo-key");
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: { select },
      log: quietLog,
      fetchWithTimeout: vi.fn(),
    }));
    vi.doMock("../src/lib/account-environment-policy", () => ({
      liveExternalActionPolicyForUser: vi.fn().mockResolvedValue({
        allowed: false,
        environment: "demo",
        code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
      }),
      externalEntityActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
    }));

    const { apolloReadyForUser } = await import("../src/lib/apollo-service");
    await expect(apolloReadyForUser("demo-user")).resolves.toBe(false);
    expect(select).not.toHaveBeenCalled();
  });
});

describe("Apollo Lead Hunt spend admission", () => {
  it("does not contact Apollo when the shared-key spend cap is reached", async () => {
    const reserve = vi.fn().mockResolvedValue({ reserved: false, reason: "cap_reached" });
    const fetchMock = vi.fn();
    vi.stubEnv("APOLLO_API_KEY", "test-apollo-key");
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: tenantLookup(),
      log: quietLog,
      fetchWithTimeout: vi.fn(),
    }));
    allowProductionApollo();
    vi.doMock("../src/middleware/audit-middleware", () => ({
      platformCostReserveUsd: vi.fn(() => 0.05),
      reservePlatformCostRecord: reserve,
      releasePlatformCostReservation: vi.fn(),
      commitPlatformCostReservation: vi.fn(),
      markPlatformCostReservationAmbiguous: vi.fn(),
    }));

    const { ApolloSpendAdmissionError, searchLeads } = await import("../src/lib/apollo-service");
    await expect(searchLeads({ titles: ["Owner"] }, "tenant-1")).rejects.toBeInstanceOf(
      ApolloSpendAdmissionError,
    );
    await expect(searchLeads({ titles: ["Owner"] }, "tenant-1")).rejects.toMatchObject({
      code: "SPEND_CAP_REACHED",
    });
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reserves and commits each successful shared-key request", async () => {
    const reservation = { auditId: 1n, userId: "tenant-1", costUsd: 0.05 };
    const reserve = vi.fn().mockResolvedValue({ reserved: true, reservation });
    const commit = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(providerResponse({ people: [] }));
    vi.stubEnv("APOLLO_API_KEY", "test-apollo-key");
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: tenantLookup(),
      log: quietLog,
      fetchWithTimeout: vi.fn(),
    }));
    allowProductionApollo();
    vi.doMock("../src/middleware/audit-middleware", () => ({
      platformCostReserveUsd: vi.fn(() => 0.05),
      reservePlatformCostRecord: reserve,
      releasePlatformCostReservation: vi.fn(),
      commitPlatformCostReservation: commit,
      markPlatformCostReservationAmbiguous: vi.fn(),
    }));

    const { searchLeads } = await import("../src/lib/apollo-service");
    await expect(searchLeads({ titles: ["Owner"] }, "tenant-1")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(reservation);
  });

  it("retains a reservation as ambiguous when the provider outcome is unknown", async () => {
    const reservation = { auditId: 2n, userId: "tenant-1", costUsd: 0.05 };
    const ambiguous = vi.fn().mockResolvedValue(undefined);
    const release = vi.fn().mockResolvedValue(undefined);
    vi.stubEnv("APOLLO_API_KEY", "test-apollo-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network timeout")));
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: tenantLookup(),
      log: quietLog,
      fetchWithTimeout: vi.fn(),
    }));
    allowProductionApollo();
    vi.doMock("../src/middleware/audit-middleware", () => ({
      platformCostReserveUsd: vi.fn(() => 0.05),
      reservePlatformCostRecord: vi.fn().mockResolvedValue({ reserved: true, reservation }),
      releasePlatformCostReservation: release,
      commitPlatformCostReservation: vi.fn(),
      markPlatformCostReservationAmbiguous: ambiguous,
    }));

    const { searchLeads } = await import("../src/lib/apollo-service");
    await expect(searchLeads({ titles: ["Owner"] }, "tenant-1")).resolves.toEqual([]);
    expect(ambiguous).toHaveBeenCalledWith(reservation);
    expect(release).not.toHaveBeenCalled();
  });

  it("releases a reservation when fetch throws before creating a request", async () => {
    const reservation = { auditId: 3n, userId: "tenant-1", costUsd: 0.05 };
    const release = vi.fn().mockResolvedValue(undefined);
    const ambiguous = vi.fn().mockResolvedValue(undefined);
    vi.stubEnv("APOLLO_API_KEY", "test-apollo-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("invalid request");
      }),
    );
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: tenantLookup(),
      log: quietLog,
      fetchWithTimeout: vi.fn(),
    }));
    allowProductionApollo();
    vi.doMock("../src/middleware/audit-middleware", () => ({
      platformCostReserveUsd: vi.fn(() => 0.05),
      reservePlatformCostRecord: vi.fn().mockResolvedValue({ reserved: true, reservation }),
      releasePlatformCostReservation: release,
      commitPlatformCostReservation: vi.fn(),
      markPlatformCostReservationAmbiguous: ambiguous,
    }));

    const { searchLeads } = await import("../src/lib/apollo-service");
    await expect(searchLeads({ titles: ["Owner"] }, "tenant-1")).resolves.toEqual([]);
    expect(release).toHaveBeenCalledWith(reservation);
    expect(ambiguous).not.toHaveBeenCalled();
  });

  it("does not reserve BotBound spend for tenant-funded OAuth calls", async () => {
    const reserve = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(providerResponse({ people: [] }));
    vi.stubEnv("APOLLO_API_KEY", "test-apollo-key");
    vi.stubGlobal("fetch", fetchMock);
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: tenantLookup([
        {
          id: "connection-1",
          accessToken: "encrypted-token",
          refreshToken: null,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      ]),
      log: quietLog,
      fetchWithTimeout: vi.fn(),
    }));
    vi.doMock("../src/lib/secret-vault", () => ({
      decryptSecret: vi.fn(() => "tenant-oauth-token"),
      encryptSecret: vi.fn((value: string) => value),
    }));
    allowProductionApollo();
    vi.doMock("../src/middleware/audit-middleware", () => ({
      platformCostReserveUsd: vi.fn(() => 0.05),
      reservePlatformCostRecord: reserve,
      releasePlatformCostReservation: vi.fn(),
      commitPlatformCostReservation: vi.fn(),
      markPlatformCostReservationAmbiguous: vi.fn(),
    }));

    const { searchLeads } = await import("../src/lib/apollo-service");
    await expect(searchLeads({ titles: ["Owner"] }, "tenant-1")).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer tenant-oauth-token",
    });
    expect(reserve).not.toHaveBeenCalled();
  });
});
