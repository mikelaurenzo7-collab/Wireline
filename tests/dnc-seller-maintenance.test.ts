import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sweepDncSellerRegistrations } from "../src/lib/dnc-seller-maintenance";
import { readDncSellerSetup } from "../src/lib/dnc-seller-registration-rules";

const fixtures = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  checkProject: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: fixtures.select, transaction: fixtures.transaction },
  log: { error: vi.fn() },
  tenantStore: { run: (_: string, work: () => unknown) => work() },
}));
vi.mock("../src/lib/dnc-scrub-project", () => ({ checkDncScrubProject: fixtures.checkProject }));
vi.mock("../src/lib/email-service", () => ({ sendEmail: fixtures.sendEmail }));
vi.mock("../src/lib/app-url", () => ({ getCanonicalAppUrl: () => "https://botbound.app" }));

const owner = "fixture-owner";
const now = new Date("2026-11-21T00:00:00.000Z");
const verification = {
  ftc_org_id: "11111111-11111",
  san: "FIXTURE-123456",
  seller_name: "Fixture Seller",
  attested_at: now.toISOString(),
  attested_by: owner,
  state: "pending",
  project_code: null,
  first_check_at: null,
  next_check_at: now.toISOString(),
};
const registration = {
  ...verification,
  area_codes: ["312"],
  expires_on: "2026-12-01",
  vendor_project_id: "BBPROJECT",
  vendor_campaign_id: 42,
  vendor_linked_at: now.toISOString(),
};

/** Exercise state transitions with an in-memory settings row, never live credentials. */
function useSettings(stored: unknown) {
  const row = { stored, email: "owner@example.test", emailVerifiedAt: now };
  const candidates = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ userId: owner }]),
  };
  const locked = { ...candidates, for: vi.fn().mockImplementation(async () => [row]) };
  fixtures.select.mockReturnValue(candidates);
  fixtures.transaction.mockImplementation(
    async (work: (tx: unknown) => Promise<void>) =>
      await work({
        execute: vi.fn().mockResolvedValue(undefined),
        select: () => locked,
        update: () => ({
          set: (update: { dncSellerRegistration: unknown }) => ({
            where: vi.fn().mockImplementation(async () => {
              row.stored = update.dncSellerRegistration;
            }),
          }),
        }),
      }),
  );
  return row;
}

describe("seller DNC maintenance", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FEDERAL_DNC_API_URL", "https://www.dncscrub.com/app/main/rpc/scrub");
    vi.stubEnv("FEDERAL_DNC_API_KEY", "fixture-scrub-key");
    vi.stubEnv("FEDERAL_DNC_PROVIDER", "dncscrub");
    vi.stubEnv("RESEND_API_KEY", "");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("persists the vendor project before polling and only activates verified coverage", async () => {
    const row = useSettings({ verification });
    fixtures.checkProject
      .mockResolvedValueOnce({ state: "pending", projectCode: "BBPROJECT" })
      .mockResolvedValueOnce({
        state: "verified",
        projectCode: "BBPROJECT",
        campaignId: 42,
        areaCodes: ["312", "773"],
        expiresOn: "2027-10-31",
      });
    await sweepDncSellerRegistrations(now);
    expect(readDncSellerSetup(row.stored)).toMatchObject({
      registration: null,
      verification: { state: "pending", project_code: "BBPROJECT" },
    });
    await sweepDncSellerRegistrations(new Date(now.getTime() + 60_000));
    expect(fixtures.checkProject).toHaveBeenCalledTimes(1);
    await sweepDncSellerRegistrations(new Date(now.getTime() + 120_000));
    expect(fixtures.checkProject.mock.calls[1][1]).toMatchObject({ project_code: "BBPROJECT" });
    expect(readDncSellerSetup(row.stored)).toMatchObject({
      verification: null,
      registration: {
        area_codes: ["312", "773"],
        expires_on: "2027-10-31",
        vendor_campaign_id: 42,
      },
    });
  });

  it("retries a renewal email with the same delivery key and records the term after acceptance", async () => {
    vi.stubEnv("RESEND_API_KEY", "fixture-email-key");
    const row = useSettings(registration);
    fixtures.sendEmail
      .mockResolvedValueOnce({ ok: false, disposition: "failed" })
      .mockResolvedValueOnce({ ok: true, disposition: "accepted" });
    await sweepDncSellerRegistrations(now);
    await sweepDncSellerRegistrations(new Date(now.getTime() + 60_000));
    expect(fixtures.sendEmail).toHaveBeenCalledTimes(1);
    await sweepDncSellerRegistrations(new Date(now.getTime() + 3_600_000));
    await sweepDncSellerRegistrations(new Date(now.getTime() + 7_200_000));
    expect(fixtures.sendEmail).toHaveBeenCalledTimes(2);
    expect(fixtures.sendEmail.mock.calls[0][0]).toEqual(fixtures.sendEmail.mock.calls[1][0]);
    expect(fixtures.sendEmail.mock.calls[0][0]).toMatchObject({
      to: "owner@example.test",
      text: expect.stringContaining("December 1, 2026"),
    });
    expect(fixtures.sendEmail.mock.calls[0][0].text).not.toContain(verification.san);
    expect(readDncSellerSetup(row.stored).registration?.renewal_reminder_for).toBe("2026-12-01");
  });

  it("keeps verification and reminders off in a non-production deployment", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RESEND_API_KEY", "fixture-email-key");
    await sweepDncSellerRegistrations(now);
    expect(fixtures.select).not.toHaveBeenCalled();
    expect(fixtures.checkProject).not.toHaveBeenCalled();
    expect(fixtures.sendEmail).not.toHaveBeenCalled();
  });
});
