import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRow } from "../src/lib/job-queue";
import type { PaidBotIdentityResult } from "../src/lib/paid-bot-identity";

const h = vi.hoisted(() => ({
  persisted: null as Record<string, unknown> | null,
  ensureIdentity: vi.fn(),
  launchBlocked: vi.fn(),
  environmentAllowed: vi.fn(),
  persist: vi.fn(),
}));

vi.mock("../src/db/schema", () => ({ jobs: { id: "job.id", result: "job.result" } }));
vi.mock("drizzle-orm", () => ({ eq: (...args: unknown[]) => args }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ result: h.persisted }] }),
      }),
    }),
    update: () => ({
      set: ({ result }: { result: Record<string, unknown> }) => ({
        where: async () => {
          h.persist(result);
          h.persisted = result;
        },
      }),
    }),
  },
}));
vi.mock("../src/lib/paid-bot-identity", () => ({
  PAID_BOT_IDENTITY_JOB_TYPE: "paid_bot_identity_reconcile",
  ensurePaidBotIdentity: h.ensureIdentity,
}));
vi.mock("../src/lib/launch-readiness", () => ({ isLaunchHardBlocked: h.launchBlocked }));
vi.mock("../src/lib/provider-spend-job-environment", () => ({
  assertProviderSpendJobEnvironmentAllowed: h.environmentAllowed,
}));
vi.mock("../src/lib/provider-identity-context", () => ({
  runWithProviderIdentity: (_userId: string, operation: () => Promise<void>) => operation(),
}));
// These dispatcher branches must not execute for an identity reconciliation job.
vi.mock("../src/lib/job-worker-base", () => ({}));
vi.mock("../src/lib/ai-audit", () => ({}));
vi.mock("../src/middleware/audit-middleware", () => ({}));
vi.mock("../src/lib/runtime-usage-billing", () => ({}));
vi.mock("../src/lib/openai-post-call-artifact", () => ({}));
vi.mock("../src/lib/scheduled-report-service", () => ({}));
vi.mock("../src/lib/proactive-lead-enrichment-job", () => ({}));
vi.mock("../src/lib/orphan-carrier-retry", () => ({}));
vi.mock("../src/lib/server-utils", () => ({}));
vi.mock("../src/lib/job-queue", () => ({}));
vi.mock("../src/lib/twilio-message-reconciliation", () => ({}));
vi.mock("../src/lib/intake-auto-dial", () => ({}));
vi.mock("../src/lib/account-deletion-fence", () => ({}));
vi.mock("../src/lib/voice/openai-realtime-call-control", () => ({}));
vi.mock("../src/lib/account-deletion-billing", () => ({}));
vi.mock("../src/lib/account-deletion-request", () => ({}));

import { handleJob } from "../src/lib/job-worker";
import { ProviderSpendPausedError } from "../src/lib/provider-spend-job-pause";

const job = {
  id: "identity-job",
  type: "paid_bot_identity_reconcile",
  userId: "11111111-1111-4111-8111-111111111111",
  payload: { userId: "11111111-1111-4111-8111-111111111111", agentId: "bot-one" },
} as JobRow;

function identity(overrides: Partial<PaidBotIdentityResult> = {}): PaidBotIdentityResult {
  return {
    eligible: true,
    planId: "email",
    selectionRequired: false,
    phone: null,
    email: "bot@example.test",
    phoneReused: false,
    emailReused: false,
    ...overrides,
  };
}

describe("paid identity worker completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.persisted = null;
    h.launchBlocked.mockReturnValue(false);
    h.environmentAllowed.mockResolvedValue(undefined);
    h.ensureIdentity.mockResolvedValue(identity());
  });

  it("completes Email-only setup without a phone and skips provider work on replay", async () => {
    await expect(handleJob(job)).resolves.toBeUndefined();
    expect(h.ensureIdentity).toHaveBeenCalledWith({
      userId: "11111111-1111-4111-8111-111111111111",
      agentId: "bot-one",
    });
    expect(h.persisted).toEqual({
      eligible: true,
      plan_id: "email",
      phone_ready: false,
      email_ready: true,
      phone_reused: false,
      email_reused: false,
    });

    await expect(handleJob(job)).resolves.toBeUndefined();
    expect(h.ensureIdentity).toHaveBeenCalledTimes(1);
    expect(h.persist).toHaveBeenCalledTimes(1);
  });

  it.each([
    { planId: "voice", email: null },
    { planId: "starter", email: null },
    { planId: "voice-email", email: "bot@example.test" },
  ])("keeps $planId claimable while number selection is required", async (result) => {
    h.ensureIdentity.mockResolvedValue(identity({ ...result, selectionRequired: true }));

    await expect(handleJob(job)).rejects.toMatchObject({
      name: "ProviderSpendPausedError",
      code: "PROVIDER_SPEND_PAUSED",
      message: "Choose a number in Phone setup to finish activation.",
    });
    expect(h.persist).not.toHaveBeenCalled();
  });

  it("completes a Calls-only identity without requiring email", async () => {
    h.ensureIdentity.mockResolvedValue(
      identity({ planId: "voice", phone: "+13125550100", phoneReused: true, email: null }),
    );

    await expect(handleJob(job)).resolves.toBeUndefined();
    expect(h.persisted).toMatchObject({
      phone_ready: true,
      email_ready: false,
      phone_reused: true,
    });
  });

  it("completes an ineligible job without repeatedly pausing it", async () => {
    h.ensureIdentity.mockResolvedValue(identity({ eligible: false, planId: null, email: null }));

    await expect(handleJob(job)).resolves.toBeUndefined();
    expect(h.persisted).toMatchObject({ eligible: false, phone_ready: false, email_ready: false });
  });

  it("propagates provider failures without recording a successful checkpoint", async () => {
    const failure = new Error("Mailbox provider unavailable");
    h.ensureIdentity.mockRejectedValueOnce(failure);

    await expect(handleJob(job)).rejects.toBe(failure);
    expect(h.persist).not.toHaveBeenCalled();
  });

  it("still pauses before identity work when the launch gate is closed", async () => {
    h.launchBlocked.mockReturnValue(true);

    await expect(handleJob(job)).rejects.toBeInstanceOf(ProviderSpendPausedError);
    expect(h.ensureIdentity).not.toHaveBeenCalled();
    expect(h.persist).not.toHaveBeenCalled();
  });

  it("rejects a mismatched tenant payload before identity work", async () => {
    await expect(
      handleJob({
        ...job,
        payload: { userId: "22222222-2222-4222-8222-222222222222", agentId: "bot-one" },
      }),
    ).rejects.toThrow("invalid tenant payload");
    expect(h.ensureIdentity).not.toHaveBeenCalled();
    expect(h.persist).not.toHaveBeenCalled();
  });

  it("rejects a missing immutable row owner without adopting the payload", async () => {
    await expect(handleJob({ ...job, userId: undefined })).rejects.toThrow(
      "no valid, consistent tenant owner",
    );
    expect(h.environmentAllowed).not.toHaveBeenCalled();
    expect(h.ensureIdentity).not.toHaveBeenCalled();
  });
});
