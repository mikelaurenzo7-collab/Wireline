import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stripe } from "../src/lib/stripe-helpers";
import { listSucceededRefunds } from "../src/middleware/stripe-runtime-allowance-retry";

// Exercise the actual local-accounting functions without importing unrelated
// authenticated route dependencies or constructing a live database connection.
function loadRefundHandler(
  reverseCredit: ReturnType<typeof vi.fn>,
  reconcileFunding: ReturnType<typeof vi.fn>,
) {
  const source = ts.createSourceFile(
    "billing-routes.ts",
    readFileSync(resolve("src/routes/billing-routes.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const names = new Set(["creditPortionUsd", "reverseSettledRefundsForCharge"]);
  const declarations = source.statements.filter(
    (statement) =>
      ts.isFunctionDeclaration(statement) && statement.name && names.has(statement.name.text),
  );
  expect(declarations).toHaveLength(2);
  const body = ts.transpileModule(declarations.map((node) => node.getText(source)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return new Function(
    "stripe",
    "tenantStore",
    "reverseCredit",
    "listSucceededRefunds",
    "reconcilePaidAllowanceFundingForCharge",
    `${body}\nreturn reverseSettledRefundsForCharge;`,
  )(
    stripe,
    { run: (_user: string, work: () => unknown) => work() },
    reverseCredit,
    listSucceededRefunds,
    reconcileFunding,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("Runtime Balance refunds consume the complete settled refund inventory", () => {
  function setup() {
    const reverseCredit = vi.fn(async () => undefined);
    // These standalone top-up fixtures have no canonical channel invoice.
    // Keep the new dependency explicit while exercising real refund pagination.
    const reconcileFunding = vi.fn(async () => false);
    vi.spyOn(stripe.paymentIntents, "retrieve").mockResolvedValue({
      id: "pi_topup",
      amount: 1000,
      metadata: { purpose: "credit_topup", wireline_user_id: "owner", credit_usd: "10" },
    } as never);
    return {
      reverseCredit,
      reconcileFunding,
      handler: loadRefundHandler(reverseCredit, reconcileFunding),
    };
  }

  function expectFundingOwnershipCheck(reconcileFunding: ReturnType<typeof vi.fn>) {
    expect(reconcileFunding).toHaveBeenCalledOnce();
    expect(reconcileFunding).toHaveBeenCalledWith({
      stripe,
      chargeId: "ch_topup",
      providerEventId: "evt_refund",
    });
  }

  it("does not trust a truncated inline refund collection", async () => {
    const { reverseCredit, reconcileFunding, handler } = setup();
    const recent = { id: "re_recent", amount: 500, status: "succeeded" };
    const old = { id: "re_old", amount: 500, status: "succeeded" };
    vi.spyOn(stripe.refunds, "list").mockResolvedValue({
      data: [recent, old],
      has_more: false,
    } as never);
    await handler(
      {
        id: "ch_topup",
        payment_intent: "pi_topup",
        amount_refunded: 1000,
        refunds: { data: [recent], has_more: true },
      },
      { id: "evt_refund" },
    );
    expect(reverseCredit).toHaveBeenCalledTimes(2);
    expect(reverseCredit).toHaveBeenCalledWith(
      "owner",
      5,
      "web_topup_refund",
      expect.objectContaining({ id: "re_old" }),
    );
    expectFundingOwnershipCheck(reconcileFunding);
  });

  it("continues past the first page and ignores unsettled refund objects", async () => {
    const { reverseCredit, reconcileFunding, handler } = setup();
    const list = vi
      .spyOn(stripe.refunds, "list")
      .mockResolvedValueOnce({
        data: [
          { id: "re_one", amount: 500, status: "succeeded" },
          { id: "re_pending", amount: 200, status: "pending" },
        ],
        has_more: true,
      } as never)
      .mockResolvedValueOnce({
        data: [{ id: "re_two", amount: 500, status: "succeeded" }],
        has_more: false,
      } as never);
    await handler(
      { id: "ch_topup", payment_intent: "pi_topup", amount_refunded: 1000 },
      { id: "evt_refund" },
    );
    expect(list).toHaveBeenLastCalledWith({
      charge: "ch_topup",
      limit: 100,
      starting_after: "re_pending",
    });
    expect(reverseCredit).toHaveBeenCalledTimes(2);
    expect(reverseCredit).toHaveBeenCalledWith(
      "owner",
      5,
      "web_topup_refund",
      expect.objectContaining({ id: "re_two" }),
    );
    expectFundingOwnershipCheck(reconcileFunding);
  });

  it("leaves the event retryable without partial debits when a later page fails", async () => {
    const { reverseCredit, reconcileFunding, handler } = setup();
    vi.spyOn(stripe.refunds, "list")
      .mockResolvedValueOnce({
        data: [{ id: "re_first", amount: 500, status: "succeeded" }],
        has_more: true,
      } as never)
      .mockRejectedValueOnce(new Error("Stripe temporarily unavailable"));
    await expect(
      handler(
        { id: "ch_topup", payment_intent: "pi_topup", amount_refunded: 1000 },
        { id: "evt_refund" },
      ),
    ).rejects.toThrow("Stripe temporarily unavailable");
    expect(reverseCredit).not.toHaveBeenCalled();
    expectFundingOwnershipCheck(reconcileFunding);
  });

  it("refuses a malformed continuation instead of acknowledging an incomplete inventory", async () => {
    const { reverseCredit, reconcileFunding, handler } = setup();
    vi.spyOn(stripe.refunds, "list").mockResolvedValue({ data: [], has_more: true } as never);
    await expect(
      handler(
        { id: "ch_topup", payment_intent: "pi_topup", amount_refunded: 1000 },
        { id: "evt_refund" },
      ),
    ).rejects.toThrow(/without a cursor/);
    expect(reverseCredit).not.toHaveBeenCalled();
    expectFundingOwnershipCheck(reconcileFunding);
  });
});
