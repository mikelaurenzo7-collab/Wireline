/**
 * Generic Postgres error classification — shared by any store module that
 * needs to degrade gracefully when the live schema lags a Drizzle migration
 * (missing column) or a table hasn't been created yet (missing relation),
 * instead of 500ing the request.
 */
import { getErrorMessage } from "./server-utils";

export function isPostgresMissingColumn(error: unknown, column = "reasoning"): boolean {
  const code = (error as { code?: string })?.code;
  if (code === "42703") return true;
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes("42703") ||
    (msg.includes(column.toLowerCase()) &&
      (msg.includes("does not exist") || msg.includes("undefined_column")))
  );
}

export function isPostgresMissingRelation(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return msg.includes("42p01") || msg.includes("does not exist");
}
