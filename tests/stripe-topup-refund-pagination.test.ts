import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Full standalone pagination, wallet effects and races are exercised in
// stripe-topup-refund-reconciliation.test.ts. This slice preserves the real
// router's ownership/error boundary without unrelated authenticated APIs.
function setup() {
  const source = ts.createSourceFile(
    "billing-routes.ts",
    readFileSync(resolve("src/routes/billing-routes.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const node = source.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "reverseSettledRefundsForCharge",
  )!;
  const body = ts.transpileModule(node.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const paid = vi.fn(async () => false);
  const topup = vi.fn(async () => true);
  const legacy = vi.fn(async () => false);
  const stripe = {};
  const handler = new Function(
    "stripe",
    "reconcilePaidAllowanceFundingForCharge",
    "reconcileStripeTopUpRefunds",
    "reverseSubscriptionRuntimeAllowanceForChargeStrict",
    `${body}\nreturn reverseSettledRefundsForCharge;`,
  )(stripe, paid, topup, legacy);
  return { paid, topup, legacy, stripe, handler };
}

describe("canonical refund router ownership", () => {
  it("lets paid-period funding own its charge without a second wallet movement", async () => {
    const p = setup();
    p.paid.mockResolvedValue(true);
    await p.handler({ id: "ch_topup" }, { id: "evt_refund", type: "charge.refunded" });
    expect(p.topup).not.toHaveBeenCalled();
    expect(p.legacy).not.toHaveBeenCalled();
  });
  it.each(["refund.updated", "refund.failed"])(
    "passes exact %s event/refund provenance to standalone reconciliation",
    async (type) => {
      const p = setup();
      await p.handler(
        { id: "ch_topup" },
        { id: "evt_refund", type, data: { object: { id: "re_topup" } } },
        false,
      );
      expect(p.paid).toHaveBeenCalledExactlyOnceWith({
        stripe: p.stripe,
        chargeId: "ch_topup",
        providerEventId: "evt_refund",
      });
      expect(p.topup).toHaveBeenCalledExactlyOnceWith({
        stripe: p.stripe,
        chargeId: "ch_topup",
        providerEventId: "evt_refund",
        refundId: "re_topup",
      });
      expect(p.legacy).not.toHaveBeenCalled();
    },
  );
  it("preserves retry on standalone inventory/ledger failure", async () => {
    const p = setup();
    p.topup.mockRejectedValue(new Error("later refund page failed"));
    await expect(
      p.handler({ id: "ch_topup" }, { id: "evt_refund", type: "charge.refunded" }),
    ).rejects.toThrow("later refund page failed");
    expect(p.legacy).not.toHaveBeenCalled();
  });
  it("keeps the legacy subscription fallback fenced off for return/update events", async () => {
    const p = setup();
    p.topup.mockResolvedValue(false);
    await p.handler(
      { id: "ch_other" },
      { id: "evt_refund", type: "refund.failed", data: { object: { id: "re_other" } } },
      false,
    );
    expect(p.legacy).not.toHaveBeenCalled();
    await p.handler({ id: "ch_other" }, { id: "evt_charge", type: "charge.refunded" });
    expect(p.legacy).toHaveBeenCalledExactlyOnceWith(
      { id: "ch_other" },
      "refund",
      undefined,
      undefined,
      "evt_charge",
    );
  });
});
