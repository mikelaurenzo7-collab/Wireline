import { and, eq, inArray, sql } from "drizzle-orm";

import { checkoutOperations } from "../db/security-schema";
import { drizzle } from "./server-context";

export const RUNTIME_BALANCE_OPERATION_PREFIX = "runtime_balance_cents:";

export type RuntimeBalanceOperationStatus =
  "creating" | "open" | "completed" | "failed" | "expired";

export type RuntimeBalanceOperationTransition = {
  id: string;
  userId: string;
  allowedFrom: readonly RuntimeBalanceOperationStatus[];
  values: {
    status: RuntimeBalanceOperationStatus;
    stripeCustomerId?: string | null;
    stripeCheckoutSessionId?: string | null;
    checkoutUrl?: string | null;
    failureCode?: string | null;
  };
};

export type RuntimeBalanceOperationCompareAndSet = (
  transition: RuntimeBalanceOperationTransition,
) => Promise<boolean>;

const ALLOWED_FROM_BY_TARGET: Readonly<
  Record<RuntimeBalanceOperationStatus, readonly RuntimeBalanceOperationStatus[]>
> = {
  creating: ["creating"],
  open: ["creating", "open"],
  // Stripe settlement is authoritative even if a local timeout or a delayed
  // failure raced the webhook. Nothing may transition away from completed.
  completed: ["creating", "open", "failed", "expired"],
  failed: ["creating", "open"],
  expired: ["creating", "open"],
};

function validateTransition(transition: RuntimeBalanceOperationTransition): void {
  if (transition.allowedFrom.length === 0) {
    throw new Error("Runtime Balance operation transition needs an allowed source state.");
  }

  const permitted = ALLOWED_FROM_BY_TARGET[transition.values.status];
  const invalidSource = transition.allowedFrom.find((source) => !permitted.includes(source));
  if (invalidSource) {
    throw new Error(
      `Runtime Balance operation cannot transition from ${invalidSource} to ${transition.values.status}.`,
    );
  }
}

const compareAndSetRuntimeBalanceOperation: RuntimeBalanceOperationCompareAndSet = async (
  transition,
) => {
  const updated = await drizzle
    .update(checkoutOperations)
    .set({ ...transition.values, updatedAt: new Date() })
    .where(
      and(
        eq(checkoutOperations.id, transition.id),
        eq(checkoutOperations.userId, transition.userId),
        sql`left(${checkoutOperations.planId}, ${RUNTIME_BALANCE_OPERATION_PREFIX.length}) = ${RUNTIME_BALANCE_OPERATION_PREFIX}`,
        inArray(checkoutOperations.status, [...transition.allowedFrom]),
      ),
    )
    .returning({ id: checkoutOperations.id });

  return updated.length > 0;
};

/**
 * Build the Runtime Balance state transition boundary around an atomic store.
 * The injectable executor keeps concurrency behavior independently testable;
 * production uses one UPDATE ... WHERE ... RETURNING compare-and-set statement.
 */
export function createRuntimeBalanceOperationTransitioner(
  compareAndSet: RuntimeBalanceOperationCompareAndSet,
): RuntimeBalanceOperationCompareAndSet {
  return async (transition) => {
    validateTransition(transition);
    return compareAndSet(transition);
  };
}

export const transitionRuntimeBalanceOperation = createRuntimeBalanceOperationTransitioner(
  compareAndSetRuntimeBalanceOperation,
);
