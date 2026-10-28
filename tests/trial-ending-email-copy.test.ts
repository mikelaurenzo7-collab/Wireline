import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("../src/lib/email-delivery-suppression", () => ({
  isProviderDeliverySuppressed: vi.fn().mockResolvedValue(false),
}));
vi.mock("../src/lib/email-compliance", () => ({
  isEmailSuppressed: vi.fn().mockResolvedValue(false),
  buildListUnsubscribeHeaders: vi.fn().mockReturnValue({}),
  buildComplianceFooterText: vi.fn().mockReturnValue("\nPostal address"),
  buildComplianceFooterHtml: vi.fn().mockReturnValue("<p>Postal address</p>"),
  getPostalAddress: vi.fn().mockReturnValue("Postal address"),
}));

import { sendTrialEndingSoonEmail } from "../src/lib/email-service";

describe("legacy trial reminder", () => {
  const priorKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-1" }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (priorKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = priorKey;
  });

  it("directs the recipient to current options without changing legacy terms", async () => {
    await expect(
      sendTrialEndingSoonEmail({
        userId: "test-user",
        to: "owner@example.com",
        daysLeft: 3,
        checkoutUrl: "https://botbound.app/pricing",
        idempotencyKey: "trial-reminder/test",
      }),
    ).resolves.toMatchObject({ ok: true, disposition: "accepted" });

    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      subject: string;
      text: string;
      html: string;
    };
    expect(body.subject).toContain("trial ends in 3 days");
    for (const content of [body.text, body.html]) {
      expect(content).toContain("trial is scheduled to end in");
      expect(content).toContain("current plan options");
      expect(content).toContain("account's current terms");
      expect(content).toContain("https://botbound.app/pricing");
      expect(content).not.toContain("Calls, Email, or Calls + Email plan");
      expect(content).not.toContain("Runtime Balance covers overflow");
      expect(content).not.toContain("your Bots will stop answering");
    }
    expect(request.headers).toMatchObject({ "Idempotency-Key": "trial-reminder/test" });
  });
});
