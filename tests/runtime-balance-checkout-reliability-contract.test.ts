import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createRuntimeBalanceOperationTransitioner,
  type RuntimeBalanceOperationCompareAndSet,
  type RuntimeBalanceOperationStatus,
} from "../src/lib/runtime-balance-operation";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Runtime Balance Checkout is a durable single operation", () => {
  const route = read("src/routes/conversation-balance-routes.ts");
  const fulfillment = read("src/lib/stripe-checkout-fulfillment.ts");
  const operationState = read("src/lib/runtime-balance-operation.ts");

  it("uses the shared active-operation mutex with an amount-specific namespace", () => {
    expect(operationState).toContain(
      'export const RUNTIME_BALANCE_OPERATION_PREFIX = "runtime_balance_cents:"',
    );
    expect(route).toContain(".insert(checkoutOperations)");
    expect(route).toContain(".onConflictDoNothing()");
    expect(route).toContain("runtimeBalanceOperationPlanId(amountCents)");
    expect(route).toContain("inArray(checkoutOperations.status, ACTIVE_OPERATION_STATES)");
  });

  it("replays an open same-amount session instead of creating a second payable URL", () => {
    const retrieve = route.indexOf("stripe.checkout.sessions.retrieve(");
    const reuse = route.indexOf('remoteSession?.status === "open"', retrieve);
    const create = route.indexOf("stripe.checkout.sessions.create(", reuse);
    expect(retrieve).toBeGreaterThan(-1);
    expect(reuse).toBeGreaterThan(retrieve);
    expect(create).toBeGreaterThan(reuse);
    expect(route).toContain("return res.json({ url: remoteSession.url, reused: true");
    expect(route).toContain("isOwnedRuntimeBalanceSession(remoteSession, req.user.id, active.id)");
  });

  it("makes customer and Checkout creation safe after a lost provider response", () => {
    expect(route).toContain("resolveOwnedStripeCustomer({");
    expect(route).toContain("wireline-runtime-balance-customer-${userId}");
    expect(route).toContain('createHash("sha256").update(existingCustomerId)');
    expect(route).toContain(
      "wireline-runtime-balance-customer-recovery-${userId}-${recoveryScope}",
    );
    expect(route).toContain("wireline-runtime-balance-checkout-${operationId}");
    expect(route).toContain('failureCode: "stripe_checkout_outcome_unknown"');
    expect(route).toContain('status: "creating"');
    expect(route).toContain('if (session.status === "complete")');
    expect(route).toContain('failureCode: "settlement_reconciliation_failed"');
    expect(route).toContain('code: "RUNTIME_BALANCE_CHECKOUT_EXPIRED"');
  });

  it("binds the durable operation into stable Checkout metadata and observability", () => {
    expect(route).toContain("wireline_checkout_operation_id: operationId");
    expect(route).toMatch(
      /stripeCheckoutIntegrationIdentifier\(\s*"runtime_balance",\s*operationId,?\s*\)/,
    );
    expect(route).toContain("client_reference_id: req.user.id");
    expect(route).toContain("const CHECKOUT_TTL_MS = 24 * 60 * 60_000");
    expect(route).toContain("const STRIPE_CHECKOUT_EXPIRY_MARGIN_MS = 60 * 60_000");
    expect(route).toMatch(
      /expires_at: Math\.floor\(\s*\(operationExpiresAt\.getTime\(\) - STRIPE_CHECKOUT_EXPIRY_MARGIN_MS\) \/ 1000/,
    );
  });

  it("closes the operation only after an idempotent credit grant", () => {
    expect(fulfillment).toMatch(
      /await addCredit\(userId, creditUsd,[\s\S]{0,900}await markCheckoutOperationCompleted\(session\)/,
    );
    expect(fulfillment).toContain(
      '(session.mode === "payment" && session.metadata?.purpose === "credit_topup")',
    );
    expect(fulfillment).toContain('failureCode: "stripe_async_payment_failed"');
  });

  it("expires only another Runtime Balance URL when changing top-up amount", () => {
    expect(route).toContain("const sameFlow = isRuntimeBalanceOperation(active?.planId)");
    expect(route).toContain("if (!active || !sameFlow)");
    expect(route).toContain(
      "sql`left(${checkoutOperations.planId}, ${RUNTIME_BALANCE_OPERATION_PREFIX.length}) = ${RUNTIME_BALANCE_OPERATION_PREFIX}`",
    );
    expect(route).toContain("stripe.checkout.sessions.expire(active.stripeCheckoutSessionId)");
  });

  it("proves a stale open Session terminal before freeing the local mutex", () => {
    const expiredLookup = route.indexOf("const [expiredOperation]");
    const remoteRetrieve = route.indexOf("stripe.checkout.sessions.retrieve(", expiredLookup);
    const remoteExpire = route.indexOf("stripe.checkout.sessions.expire(", remoteRetrieve);
    const localExpire = route.indexOf(
      "const expired = await markRuntimeBalanceOperation(",
      remoteExpire,
    );
    expect(expiredLookup).toBeGreaterThan(-1);
    expect(remoteRetrieve).toBeGreaterThan(expiredLookup);
    expect(remoteExpire).toBeGreaterThan(remoteRetrieve);
    expect(localExpire).toBeGreaterThan(remoteExpire);
    expect(route).toContain('code: "CHECKOUT_STATE_UNCLEAR"');
  });

  it("uses one owner-scoped compare-and-set and never accepts completed as a source", () => {
    expect(operationState).toContain("eq(checkoutOperations.id, transition.id)");
    expect(operationState).toContain("eq(checkoutOperations.userId, transition.userId)");
    expect(operationState).toContain(
      "sql`left(${checkoutOperations.planId}, ${RUNTIME_BALANCE_OPERATION_PREFIX.length}) = ${RUNTIME_BALANCE_OPERATION_PREFIX}`",
    );
    expect(operationState).toContain(
      "inArray(checkoutOperations.status, [...transition.allowedFrom])",
    );
    expect(operationState).toContain('completed: ["creating", "open", "failed", "expired"]');
    expect(route).toContain("if (!expired) return runtimeBalanceOperationChanged");
    expect(fulfillment).toContain('allowedFrom: ["creating", "open", "failed", "expired"]');
  });
});

type MemoryOperation = {
  id: string;
  userId: string;
  planId: string;
  status: RuntimeBalanceOperationStatus;
};

function memoryCompareAndSet(row: MemoryOperation): RuntimeBalanceOperationCompareAndSet {
  return async (transition) => {
    if (
      row.id !== transition.id ||
      row.userId !== transition.userId ||
      !row.planId.startsWith("runtime_balance_cents:") ||
      !transition.allowedFrom.includes(row.status)
    ) {
      return false;
    }

    row.status = transition.values.status;
    return true;
  };
}

describe("Runtime Balance operation transition behavior", () => {
  it("keeps webhook completion immutable against a stale open-state writer", async () => {
    const row: MemoryOperation = {
      id: "operation-a",
      userId: "user-a",
      planId: "runtime_balance_cents:2500",
      status: "creating",
    };
    const transition = createRuntimeBalanceOperationTransitioner(memoryCompareAndSet(row));

    const [completed, staleOpen] = await Promise.all([
      transition({
        id: row.id,
        userId: row.userId,
        allowedFrom: ["creating", "open", "failed", "expired"],
        values: { status: "completed" },
      }),
      Promise.resolve().then(() =>
        transition({
          id: row.id,
          userId: row.userId,
          allowedFrom: ["creating", "open"],
          values: { status: "open" },
        }),
      ),
    ]);

    expect(completed).toBe(true);
    expect(staleOpen).toBe(false);
    expect(row.status).toBe("completed");
    expect(["creating", "open"]).not.toContain(row.status);
  });

  it("lets authoritative settlement repair a raced local expiry, then stays terminal", async () => {
    const row: MemoryOperation = {
      id: "operation-b",
      userId: "user-b",
      planId: "runtime_balance_cents:5000",
      status: "open",
    };
    const transition = createRuntimeBalanceOperationTransitioner(memoryCompareAndSet(row));

    expect(
      await transition({
        id: row.id,
        userId: row.userId,
        allowedFrom: ["open"],
        values: { status: "expired" },
      }),
    ).toBe(true);
    expect(
      await transition({
        id: row.id,
        userId: row.userId,
        allowedFrom: ["creating", "open", "failed", "expired"],
        values: { status: "completed" },
      }),
    ).toBe(true);
    expect(
      await transition({
        id: row.id,
        userId: row.userId,
        allowedFrom: ["creating", "open"],
        values: { status: "open" },
      }),
    ).toBe(false);
    expect(row.status).toBe("completed");
  });

  it("rejects wrong-owner, wrong-flow, and invalid terminal regressions", async () => {
    const ownerRow: MemoryOperation = {
      id: "operation-c",
      userId: "user-c",
      planId: "runtime_balance_cents:1000",
      status: "creating",
    };
    const ownerTransition = createRuntimeBalanceOperationTransitioner(
      memoryCompareAndSet(ownerRow),
    );
    expect(
      await ownerTransition({
        id: ownerRow.id,
        userId: "another-user",
        allowedFrom: ["creating"],
        values: { status: "open" },
      }),
    ).toBe(false);

    const planRow: MemoryOperation = {
      ...ownerRow,
      planId: "runtimexbalancexcents:1000",
      status: "creating",
    };
    const planTransition = createRuntimeBalanceOperationTransitioner(memoryCompareAndSet(planRow));
    expect(
      await planTransition({
        id: planRow.id,
        userId: planRow.userId,
        allowedFrom: ["creating"],
        values: { status: "open" },
      }),
    ).toBe(false);

    await expect(
      ownerTransition({
        id: ownerRow.id,
        userId: ownerRow.userId,
        allowedFrom: ["completed"],
        values: { status: "open" },
      }),
    ).rejects.toThrow("cannot transition from completed to open");
  });

  it("does not renew the active-user slot after completion wins the release race", async () => {
    const rows: MemoryOperation[] = [
      {
        id: "operation-d",
        userId: "user-d",
        planId: "runtime_balance_cents:2000",
        status: "open",
      },
    ];
    const transition = createRuntimeBalanceOperationTransitioner(memoryCompareAndSet(rows[0]));

    const completed = await transition({
      id: rows[0].id,
      userId: rows[0].userId,
      allowedFrom: ["creating", "open", "failed", "expired"],
      values: { status: "completed" },
    });
    const released = await transition({
      id: rows[0].id,
      userId: rows[0].userId,
      allowedFrom: ["open"],
      values: { status: "expired" },
    });
    if (released) {
      rows.push({
        id: "operation-renewed",
        userId: rows[0].userId,
        planId: "runtime_balance_cents:3000",
        status: "creating",
      });
    }

    expect(completed).toBe(true);
    expect(released).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("completed");
  });
});
