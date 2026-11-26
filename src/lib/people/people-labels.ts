import { log } from "../server-context";
import { findPeopleByIdentifiers, type PersonLabel } from "./people-service";

export type PersonLabelled = { personId: string | null; personName: string | null };

type Lookup = (
  userId: string,
  kind: "phone" | "email",
  values: readonly unknown[],
) => Promise<Map<string, PersonLabel>>;

/**
 * Adds the saved person's id and name to each row of a call or text list, so
 * a list reads "Dana Ruiz" instead of a bare number. People is a convenience
 * here: when it cannot answer, every row comes back unlabelled and the list
 * still loads.
 */
export async function withPersonLabels<T>(
  userId: string,
  rows: readonly T[],
  kind: "phone" | "email",
  valueOf: (row: T) => unknown,
  lookup: Lookup = findPeopleByIdentifiers,
): Promise<Array<T & PersonLabelled>> {
  let labels = new Map<string, PersonLabel>();
  if (rows.length) {
    try {
      labels = await lookup(userId, kind, rows.map(valueOf));
    } catch (error) {
      log.warn("People labels unavailable for a list", {
        kind,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return rows.map((row) => {
    const value = valueOf(row);
    const person = typeof value === "string" ? labels.get(value) : undefined;
    return {
      ...row,
      personId: person?.id ?? null,
      personName: person?.displayName?.trim() || null,
    };
  });
}
