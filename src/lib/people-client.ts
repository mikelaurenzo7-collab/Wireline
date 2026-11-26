import { authFetch, readApiJson } from "./api";

/**
 * Browser-side types and calls for People. Mirrors the shapes returned by
 * src/routes/people-routes.ts; the server owns every rule.
 */

export type PersonIdentifierKind = "phone" | "email";

export type PersonIdentifier = {
  id: string;
  personId: string;
  kind: PersonIdentifierKind;
  value: string;
  source: string;
  verified: boolean;
  createdAt: string;
};

export type Person = {
  id: string;
  displayName: string | null;
  company: string | null;
  status: "active" | "archived";
  summary: string | null;
  customFields: Record<string, string>;
  mergedIntoId: string | null;
  createdAt: string;
  updatedAt: string;
  identifiers: PersonIdentifier[];
  mergedPeople?: Array<{ id: string; displayName: string | null; mergedIntoId: string | null }>;
};

export type TimelineItem = {
  id: string;
  source: "call" | "sms" | "email" | "appointment" | "event";
  at: string;
  direction: "inbound" | "outbound" | null;
  title: string;
  preview: string | null;
  agentId: string | null;
  demo: boolean;
  ref: { kind: TimelineItem["source"]; id: string };
  event?: { kind: string; actor: string; body: string | null; data: Record<string, unknown> };
};

export type PeopleSuggestion = {
  kind: PersonIdentifierKind;
  value: string;
  nameHint: string | null;
  lastSeenAt: string;
  sources: Array<"call" | "sms" | "email" | "appointment">;
  count: number;
};

export type PeopleApiError = {
  message: string;
  status: number;
  code?: string;
  /** For an identifier conflict: the person who already holds it. */
  conflictPersonId?: string;
};

export type PeopleResult<T> = { ok: true; data: T } | { ok: false; error: PeopleApiError };

async function call<T>(
  path: string,
  init: RequestInit & { signal?: AbortSignal } = {},
): Promise<PeopleResult<T>> {
  try {
    const response = await authFetch(path, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
    if (!response.ok) {
      const raw = (await response
        .clone()
        .json()
        .catch(() => null)) as {
        details?: { personId?: unknown };
      } | null;
      const parsed = await readApiJson(response);
      const conflictPersonId =
        typeof raw?.details?.personId === "string" ? raw.details.personId : undefined;
      return {
        ok: false,
        error: {
          message: parsed.ok ? "Something went wrong. Try again." : parsed.error,
          status: response.status,
          code: parsed.ok ? undefined : parsed.code,
          conflictPersonId,
        },
      };
    }
    const parsed = await readApiJson<T>(response);
    return parsed.ok
      ? { ok: true, data: parsed.data }
      : { ok: false, error: { message: parsed.error, status: parsed.status, code: parsed.code } };
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
    return {
      ok: false,
      error: {
        message: "People couldn't be reached. Check your connection and try again.",
        status: 0,
      },
    };
  }
}

const json = (body: unknown) => JSON.stringify(body);

export function listPeople(
  params: { q?: string; status?: "active" | "archived"; cursor?: string | null },
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status === "archived") search.set("status", "archived");
  if (params.cursor) search.set("cursor", params.cursor);
  const query = search.toString();
  return call<{ people: Person[]; nextCursor: string | null }>(
    `/api/people${query ? `?${query}` : ""}`,
    { signal },
  );
}

export function listSuggestions(signal?: AbortSignal) {
  return call<{ suggestions: PeopleSuggestion[] }>("/api/people/suggestions", { signal });
}

export function getPerson(personId: string, signal?: AbortSignal) {
  return call<{ person: Person }>(`/api/people/${encodeURIComponent(personId)}`, { signal });
}

/**
 * The saved person who holds this phone or email, or null when nobody does.
 * Sent in the request body: this runs for every call, text and email an owner
 * opens, and a customer's number or address does not belong in a URL that
 * proxies and request logs keep.
 */
export function lookupPerson(kind: PersonIdentifierKind, value: string, signal?: AbortSignal) {
  return call<{ person: Person | null }>("/api/people/lookup", {
    method: "POST",
    body: JSON.stringify({ kind, value }),
    signal,
  });
}

/**
 * Opens People with the add form filled in, for a phone or email seen on a
 * call, text, email or booking that nobody has saved yet.
 */
export function peopleAddHref(kind: PersonIdentifierKind, value: string, nameHint?: string | null) {
  const search = new URLSearchParams({ add: kind, value });
  if (nameHint?.trim()) search.set("name", nameHint.trim());
  return `/people?${search.toString()}`;
}

export function getTimeline(personId: string, before?: string | null, signal?: AbortSignal) {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return call<{ items: TimelineItem[]; nextCursor: string | null }>(
    `/api/people/${encodeURIComponent(personId)}/timeline${query}`,
    { signal },
  );
}

export function createPerson(input: {
  displayName?: string;
  company?: string;
  identifiers: Array<{ kind: PersonIdentifierKind; value: string; source?: string }>;
}) {
  return call<{ person: Person }>("/api/people", { method: "POST", body: json(input) });
}

export function updatePerson(
  personId: string,
  patch: Partial<Pick<Person, "displayName" | "company" | "status" | "summary" | "customFields">>,
) {
  return call<{ person: Person }>(`/api/people/${encodeURIComponent(personId)}`, {
    method: "PATCH",
    body: json(patch),
  });
}

export function deletePerson(personId: string) {
  return call<{ deleted: true }>(`/api/people/${encodeURIComponent(personId)}`, {
    method: "DELETE",
  });
}

export function addIdentifier(personId: string, kind: PersonIdentifierKind, value: string) {
  return call<{ person: Person }>(`/api/people/${encodeURIComponent(personId)}/identifiers`, {
    method: "POST",
    body: json({ kind, value }),
  });
}

export function removeIdentifier(personId: string, identifierId: string) {
  return call<{ person: Person }>(
    `/api/people/${encodeURIComponent(personId)}/identifiers/${encodeURIComponent(identifierId)}`,
    { method: "DELETE" },
  );
}

export function addNote(personId: string, body: string) {
  return call<{ note: { id: string } }>(`/api/people/${encodeURIComponent(personId)}/notes`, {
    method: "POST",
    body: json({ body }),
  });
}

export function deleteNote(personId: string, noteId: string) {
  return call<{ deleted: true }>(
    `/api/people/${encodeURIComponent(personId)}/notes/${encodeURIComponent(noteId)}`,
    { method: "DELETE" },
  );
}

export function mergeInto(personId: string, targetId: string) {
  return call<{ person: Person }>(`/api/people/${encodeURIComponent(personId)}/merge`, {
    method: "POST",
    body: json({ targetId }),
  });
}

export function unmerge(personId: string) {
  return call<{ person: Person }>(`/api/people/${encodeURIComponent(personId)}/unmerge`, {
    method: "POST",
  });
}

/** What to call a person when they have no name yet. */
export function personLabel(person: Pick<Person, "displayName" | "identifiers">): string {
  if (person.displayName) return person.displayName;
  const first = person.identifiers[0];
  return first ? first.value : "Unnamed Person";
}
