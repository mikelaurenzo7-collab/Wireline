import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkDncScrubProject, dncScrubProjectCode } from "../src/lib/dnc-scrub-project";
import type { DncSellerVerification } from "../src/lib/dnc-seller-registration-rules";

const NOW = new Date("2026-11-21T01:00:00Z");
const request: DncSellerVerification = {
  ftc_org_id: "11111111-11111",
  san: "FIXTURE-123456",
  seller_name: "Fixture Seller",
  attested_at: NOW.toISOString(),
  attested_by: "workspace-a",
  state: "pending",
  project_code: null,
  first_check_at: null,
  next_check_at: NOW.toISOString(),
};
const code = dncScrubProjectCode(request.attested_by, request.ftc_org_id, request.san);
const canonicalCode = `ACCOUNT_${code}`;
const validation = {
  Status: "validated",
  OrgId: request.ftc_org_id,
  San: request.san,
  Expiration: "2027-10-31",
  HasEntireUs: false,
  AreaCodes: ["773", "312", "773"],
};
const project = {
  ProjectCode: canonicalCode,
  AcctId: "ACCOUNT",
  Status: "active",
  DefaultCampaignId: 42,
  UseMasterDncSub: false,
  UseMasterDncDb: false,
  UseMasterEbrDb: false,
  FtcValidation: validation,
};

describe("DNCScrub seller verification", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("FEDERAL_DNC_API_URL", "https://www.dncscrub.com/app/main/rpc/scrub");
    vi.stubEnv("FEDERAL_DNC_API_KEY", "fixture-scrub-key");
    vi.stubEnv("FEDERAL_DNC_PROVIDER", "dncscrub");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("submits the seller's IDs and polls the resulting project for verified coverage", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...project, FtcValidation: { ...validation, Status: "pending" } }),
    });
    expect(await checkDncScrubProject("workspace-a", request, NOW)).toEqual({
      state: "pending",
      projectCode: canonicalCode,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://dataapi.dncscrub.com/v1.5/projects/${code}`);
    expect(init).toMatchObject({
      method: "PUT",
      redirect: "error",
      headers: { loginId: "fixture-scrub-key" },
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      FtcOrgId: request.ftc_org_id,
      FtcSan: request.san,
      UseMasterDncSub: false,
      UseMasterDncDb: false,
      UseMasterEbrDb: false,
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => project });
    expect(
      await checkDncScrubProject("workspace-a", { ...request, project_code: canonicalCode }, NOW),
    ).toEqual({
      state: "verified",
      projectCode: canonicalCode,
      campaignId: 42,
      areaCodes: ["312", "773"],
      expiresOn: "2027-10-31",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      `https://dataapi.dncscrub.com/v1.5/projects/${canonicalCode}`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each([
    { ProjectCode: "ANOTHERPROJECT" },
    { UseMasterDncSub: true },
    { Status: "inactive" },
    { DefaultCampaignId: 0 },
    { FtcValidation: { ...validation, OrgId: "22222222-22222" } },
    { FtcValidation: { ...validation, San: "DIFFERENT-SAN" } },
    { FtcValidation: { ...validation, AreaCodes: [] } },
    { FtcValidation: { ...validation, Expiration: "2027-02-30" } },
  ])("rejects a project response with invalid scope or coverage %#", async (overrides) => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ...project, ...overrides }) });
    expect(await checkDncScrubProject("workspace-a", request, NOW)).toEqual({
      state: "unavailable",
    });
  });

  it.each([{ Status: "failed" }, { Expiration: "2026-11-20" }])(
    "keeps a rejected or expired FTC subscription blocked",
    async (overrides) => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...project, FtcValidation: { ...validation, ...overrides } }),
      });
      expect(await checkDncScrubProject("workspace-a", request, NOW)).toEqual({ state: "failed" });
    },
  );

  it("never sends a seller's credentials to a different configured screening vendor", async () => {
    vi.stubEnv("FEDERAL_DNC_API_URL", "https://fixture.example.test");
    expect(await checkDncScrubProject("workspace-a", request, NOW)).toEqual({
      state: "unavailable",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allocates a separate stable project for every workspace and SAN", () => {
    expect(dncScrubProjectCode("workspace-a", request.ftc_org_id, request.san)).toBe(code);
    expect(dncScrubProjectCode("workspace-b", request.ftc_org_id, request.san)).not.toBe(code);
    expect(dncScrubProjectCode("workspace-a", request.ftc_org_id, "ANOTHER-SAN")).not.toBe(code);
  });
});
