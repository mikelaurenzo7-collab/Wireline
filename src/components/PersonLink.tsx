import { useEffect, useState } from "react";
import { Link } from "react-router";
import { UserPlus, UserRound } from "lucide-react";

import {
  lookupPerson,
  peopleAddHref,
  type Person,
  type PersonIdentifierKind,
} from "../lib/people-client";
import { cn } from "../lib/utils";
import { Button } from "./atoms";

type Lookup =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "missing" }
  | { status: "found"; person: Pick<Person, "id" | "displayName"> };

// One call report, text thread or email thread is open at a time, and owners
// flip between them. A short memory keeps flipping back from re-asking.
const LOOKUP_TTL_MS = 30_000;
const recent = new Map<string, { at: number; result: Lookup }>();

/**
 * The bridge from a channel back to the customer: on a call, text thread or
 * email thread, links to the saved person who holds that phone or email, or
 * offers to save them to People with the details already filled in.
 */
export default function PersonLink({
  kind,
  value,
  nameHint,
  className,
}: {
  kind: PersonIdentifierKind;
  value: string | null | undefined;
  nameHint?: string | null;
  className?: string;
}) {
  const identifier = value?.trim() || "";
  const key = `${kind}:${identifier.toLowerCase()}`;
  const [lookup, setLookup] = useState<Lookup>({ status: "loading" });

  useEffect(() => {
    if (!identifier) {
      setLookup({ status: "unavailable" });
      return;
    }
    const cached = recent.get(key);
    if (cached && Date.now() - cached.at < LOOKUP_TTL_MS) {
      setLookup(cached.result);
      return;
    }
    const controller = new AbortController();
    setLookup({ status: "loading" });
    void lookupPerson(kind, identifier, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const result: Lookup = !response.ok
          ? { status: "unavailable" }
          : response.data.person
            ? {
                status: "found",
                person: {
                  id: response.data.person.id,
                  displayName: response.data.person.displayName,
                },
              }
            : { status: "missing" };
        if (result.status !== "unavailable") recent.set(key, { at: Date.now(), result });
        setLookup(result);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [identifier, key, kind]);

  // People is a convenience on these screens: while it loads, or when it is
  // unreachable, the channel view stands on its own with no placeholder.
  if (lookup.status === "loading" || lookup.status === "unavailable") return null;

  if (lookup.status === "found") {
    const name = lookup.person.displayName?.trim();
    return (
      <Button asChild variant="outline" size="sm" className={cn("shrink-0", className)}>
        <Link
          to={`/people/${encodeURIComponent(lookup.person.id)}`}
          aria-label={name ? `Open ${name} in People` : "Open this person in People"}
        >
          <UserRound aria-hidden="true" />
          {name || "View Person"}
        </Link>
      </Button>
    );
  }

  return (
    <Button asChild variant="ghost" size="sm" className={cn("shrink-0", className)}>
      <Link to={peopleAddHref(kind, identifier, nameHint)}>
        <UserPlus aria-hidden="true" />
        Save to People
      </Link>
    </Button>
  );
}

/** Test seam: forget remembered lookups between cases. */
export function resetPersonLinkCache() {
  recent.clear();
}
