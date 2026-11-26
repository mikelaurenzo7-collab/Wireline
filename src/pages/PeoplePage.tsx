import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  GitMerge,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  Users,
} from "lucide-react";

import { Badge, Button, Input, NativeSelect, Skeleton, Textarea } from "../components/atoms";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/atoms/Dialog";
import { SearchField, StatusNotice } from "../components/molecules";
import ConfirmModal from "../components/ConfirmModal";
import WorkspaceShell from "../components/WorkspaceShell";
import { WorkspaceOperateIntro, WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import {
  addIdentifier,
  addNote,
  createPerson,
  deleteNote,
  deletePerson,
  getPerson,
  getTimeline,
  listPeople,
  listSuggestions,
  mergeInto,
  personLabel,
  removeIdentifier,
  unmerge,
  updatePerson,
  type PeopleApiError,
  type PeopleSuggestion,
  type Person,
  type PersonIdentifierKind,
  type TimelineItem,
} from "../lib/people-client";
import { formatDateTime, formatRelative } from "../lib/safe-date";
import { formatPhone } from "../lib/safe-number";
import { cn } from "../lib/utils";

const SOURCE_LABELS: Record<PeopleSuggestion["sources"][number], string> = {
  call: "Calls",
  sms: "Texts",
  email: "Email",
  appointment: "Bookings",
};

function identifierText(kind: PersonIdentifierKind, value: string): string {
  return kind === "phone" ? formatPhone(value, value) : value;
}

/** The line under a person's name in the list: company and contact details. */
function personSubtitle(person: Person): string {
  const label = personLabel(person);
  const details = [
    person.company,
    ...person.identifiers
      .filter((identifier) => identifier.value !== label)
      .slice(0, person.displayName ? 1 : 2)
      .map((identifier) => identifierText(identifier.kind, identifier.value)),
  ].filter(Boolean);
  if (details.length) return details.join(" · ");
  if (!person.displayName && person.identifiers.length) return "No name yet";
  return "No phone or email yet";
}

function ErrorNotice({ error, onRetry }: { error: PeopleApiError; onRetry?: () => void }) {
  return (
    <StatusNotice
      tone={error.code === "PEOPLE_UNAVAILABLE" ? "info" : "warning"}
      title={error.code === "PEOPLE_UNAVAILABLE" ? "People Is Coming Soon" : "Couldn't Load People"}
      className="m-4"
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      {error.message}
    </StatusNotice>
  );
}

function ConflictNotice({ error }: { error: PeopleApiError }) {
  return (
    <p role="alert" className="text-sm text-[var(--wireline-color-status-error)]">
      {error.message}{" "}
      {error.conflictPersonId ? (
        <Link className="font-semibold underline" to={`/people/${error.conflictPersonId}`}>
          Open Them
        </Link>
      ) : null}
    </p>
  );
}

/* ── Add person ───────────────────────────────────────────────────── */

function AddPersonDialog({
  open,
  initial,
  onClose,
  onCreated,
}: {
  open: boolean;
  initial: { displayName?: string; phone?: string; email?: string; source?: string } | null;
  onClose: () => void;
  onCreated: (person: Person) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PeopleApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(initial?.displayName ?? "");
    setCompany("");
    setPhone(initial?.phone ?? "");
    setEmail(initial?.email ?? "");
    setError(null);
  }, [open, initial]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const identifiers: Array<{ kind: PersonIdentifierKind; value: string; source?: string }> = [];
    if (phone.trim())
      identifiers.push({ kind: "phone", value: phone.trim(), source: initial?.source });
    if (email.trim())
      identifiers.push({ kind: "email", value: email.trim(), source: initial?.source });
    const result = await createPerson({
      displayName: displayName.trim() || undefined,
      company: company.trim() || undefined,
      identifiers,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.data.person);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !busy ? onClose() : undefined)}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add Person</DialogTitle>
            <DialogDescription>
              Your Bot links calls, texts, email and bookings to this person by their phone number
              and email address.
            </DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Company
            <Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Phone
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Email
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              autoComplete="off"
            />
          </label>
          {error ? <ConflictNotice error={error} /> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" aria-busy={busy} disabled={busy}>
              Save Person
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit person ──────────────────────────────────────────────────── */

function EditPersonDialog({
  person,
  open,
  onClose,
  onSaved,
}: {
  person: Person;
  open: boolean;
  onClose: () => void;
  onSaved: (person: Person) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [company, setCompany] = useState("");
  const [summary, setSummary] = useState("");
  const [fields, setFields] = useState<Array<{ key: string; value: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PeopleApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(person.displayName ?? "");
    setCompany(person.company ?? "");
    setSummary(person.summary ?? "");
    setFields(Object.entries(person.customFields).map(([key, value]) => ({ key, value })));
    setError(null);
  }, [open, person]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const customFields: Record<string, string> = {};
    for (const field of fields) if (field.key.trim()) customFields[field.key.trim()] = field.value;
    const result = await updatePerson(person.id, {
      displayName: displayName.trim() || null,
      company: company.trim() || null,
      summary: summary.trim() || null,
      customFields,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.data.person);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !busy ? onClose() : undefined)}>
      <DialogContent>
        <form onSubmit={submit} className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Person</DialogTitle>
            <DialogDescription>Changes are kept in this person's history.</DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Company
            <Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Summary
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={2000}
              rows={4}
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Details</legend>
            {fields.map((field, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  aria-label={`Detail ${index + 1} name`}
                  placeholder="Gate Code"
                  value={field.key}
                  maxLength={40}
                  onChange={(e) =>
                    setFields((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, key: e.target.value } : entry,
                      ),
                    )
                  }
                />
                <Input
                  aria-label={`Detail ${index + 1} value`}
                  value={field.value}
                  maxLength={500}
                  onChange={(e) =>
                    setFields((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, value: e.target.value } : entry,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove detail ${index + 1}`}
                  onClick={() => setFields((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            {fields.length < 20 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setFields((current) => [...current, { key: "", value: "" }])}
              >
                <Plus aria-hidden="true" /> Add Detail
              </Button>
            ) : null}
          </fieldset>
          {error ? <ConflictNotice error={error} /> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" aria-busy={busy} disabled={busy}>
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Merge ────────────────────────────────────────────────────────── */

function MergeDialog({
  person,
  open,
  onClose,
  onMerged,
}: {
  person: Person;
  open: boolean;
  onClose: () => void;
  onMerged: (target: Person) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PeopleApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void listPeople({ q: query.trim() || undefined }, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result.ok)
            setResults(result.data.people.filter((candidate) => candidate.id !== person.id));
          else setError(result.error);
        })
        .catch(() => {});
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, person.id]);

  const merge = async (target: Person) => {
    setBusy(true);
    setError(null);
    const result = await mergeInto(person.id, target.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onMerged(result.data.person);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !busy ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge {personLabel(person)} Into Someone</DialogTitle>
          <DialogDescription>
            Their phones, email and history appear on the person you choose. Nothing is deleted, and
            you can unmerge later.
          </DialogDescription>
        </DialogHeader>
        <SearchField
          aria-label="Search people to merge into"
          placeholder="Search by name, phone or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
        />
        <ul
          className="flex max-h-72 flex-col gap-1 overflow-y-auto"
          aria-label="People to merge into"
        >
          {results.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void merge(candidate)}
                className="flex w-full min-h-11 flex-col items-start rounded-md px-3 py-2 text-left hover:bg-[var(--wireline-color-action-primary-container)] focus-visible:outline-2 focus-visible:outline-[var(--wireline-color-focus-default)]"
              >
                <span className="font-semibold">{personLabel(candidate)}</span>
                <span className="text-sm text-[var(--wireline-color-text-secondary)]">
                  {candidate.identifiers
                    .slice(0, 2)
                    .map((identifier) => identifierText(identifier.kind, identifier.value))
                    .join(", ") ||
                    candidate.company ||
                    "No phone or email yet"}
                </span>
              </button>
            </li>
          ))}
          {!results.length ? (
            <li className="px-3 py-2 text-sm text-[var(--wireline-color-text-secondary)]">
              No one else matches yet.
            </li>
          ) : null}
        </ul>
        {error ? <ConflictNotice error={error} /> : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Timeline ─────────────────────────────────────────────────────── */

function TimelineIcon({ item }: { item: TimelineItem }) {
  const Icon =
    item.source === "call"
      ? Phone
      : item.source === "sms"
        ? MessageSquare
        : item.source === "email"
          ? Mail
          : item.source === "appointment"
            ? CalendarDays
            : StickyNote;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--wireline-color-surface-subtle)]">
      <Icon aria-hidden="true" className="h-4 w-4" />
    </span>
  );
}

// "Open" lands on the exact call, thread or booking, not just its list.
function timelineHref(item: TimelineItem): string | null {
  const id = encodeURIComponent(item.ref.id);
  if (item.source === "call") return `/phone?tab=logs&call=${id}`;
  if (item.source === "sms") return `/inbox?tab=sms&thread=${id}`;
  if (item.source === "email") return `/inbox?tab=email&thread=${id}`;
  if (item.source === "appointment") return `/calendar?appointment=${id}`;
  return null;
}

function PersonTimeline({ person, reloadKey }: { person: Person; reloadKey: number }) {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<PeopleApiError | null>(null);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    setError(null);
    void getTimeline(person.id, null, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) return setError(result.error);
        setItems(result.data.items);
        setCursor(result.data.nextCursor);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [person.id, reloadKey, reload]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    const result = await getTimeline(person.id, cursor);
    setLoadingMore(false);
    if (!result.ok) return setError(result.error);
    setItems((current) => {
      const seen = new Set((current ?? []).map((item) => item.id));
      return [...(current ?? []), ...result.data.items.filter((item) => !seen.has(item.id))];
    });
    setCursor(result.data.nextCursor);
  };

  const saveNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    setSavingNote(true);
    const result = await addNote(person.id, note);
    setSavingNote(false);
    if (!result.ok) return setError(result.error);
    setNote("");
    setReload((value) => value + 1);
  };

  const removeNote = async (item: TimelineItem) => {
    const result = await deleteNote(person.id, item.ref.id);
    if (!result.ok) return setError(result.error);
    setItems((current) => (current ?? []).filter((entry) => entry.id !== item.id));
  };

  return (
    <section aria-labelledby="person-timeline-heading" className="flex flex-col gap-3">
      <h2 id="person-timeline-heading" className="text-base font-semibold">
        Timeline
      </h2>
      <form onSubmit={saveNote} className="flex flex-col gap-2">
        <label htmlFor="person-note" className="sr-only">
          Add a note
        </label>
        <Textarea
          id="person-note"
          rows={2}
          maxLength={4000}
          placeholder="Add a note for your team"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          className="self-end"
          disabled={savingNote || !note.trim()}
          aria-busy={savingNote}
        >
          Add Note
        </Button>
      </form>
      {error ? <ErrorNotice error={error} onRetry={() => setReload((value) => value + 1)} /> : null}
      {items === null && !error ? (
        <div className="flex flex-col gap-2" aria-label="Loading timeline">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : null}
      {items && !items.length ? (
        <p className="text-sm text-[var(--wireline-color-text-secondary)]">
          Nothing yet. Calls, texts, email and bookings with this person appear here.
        </p>
      ) : null}
      {items?.length ? (
        <ol className="flex flex-col gap-1" aria-label={`Timeline for ${personLabel(person)}`}>
          {items.map((item) => {
            const href = timelineHref(item);
            return (
              <li key={item.id} className="flex gap-3 rounded-md px-1 py-2">
                <TimelineIcon item={item} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{item.title}</span>
                    <time
                      dateTime={item.at}
                      title={formatDateTime(item.at)}
                      className="text-xs text-[var(--wireline-color-text-secondary)]"
                    >
                      {formatRelative(item.at)}
                    </time>
                    {item.demo ? <Badge variant="outline">Demo</Badge> : null}
                  </div>
                  {item.preview || (item.event?.kind === "note" && item.event.body) ? (
                    <p className="mt-0.5 whitespace-pre-line break-words text-sm text-[var(--wireline-color-text-secondary)]">
                      {item.event?.kind === "note" ? item.event.body : item.preview}
                    </p>
                  ) : null}
                </div>
                {href ? (
                  <Link
                    to={href}
                    className="self-center text-sm font-semibold text-[var(--wireline-color-action-primary-default)]"
                  >
                    Open
                  </Link>
                ) : item.event?.kind === "note" && item.event.actor === "owner" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete note"
                    onClick={() => void removeNote(item)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {cursor ? (
        <Button
          variant="outline"
          size="sm"
          className="self-center"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          aria-busy={loadingMore}
        >
          Show Older
        </Button>
      ) : null}
    </section>
  );
}

/* ── Person detail ────────────────────────────────────────────────── */

function PersonDetail({
  personId,
  onChanged,
  onDeleted,
}: {
  personId: string;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const navigate = useNavigate();
  const [person, setPerson] = useState<Person | null>(null);
  const [error, setError] = useState<PeopleApiError | null>(null);
  const [actionError, setActionError] = useState<PeopleApiError | null>(null);
  const [reload, setReload] = useState(0);
  const [timelineKey, setTimelineKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newKind, setNewKind] = useState<PersonIdentifierKind>("phone");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void getPerson(personId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) return setError(result.error);
        setPerson(result.data.person);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [personId, reload]);

  const applied = (next: Person) => {
    setPerson(next);
    setActionError(null);
    setTimelineKey((value) => value + 1);
    onChanged();
  };

  const run = async (
    action: () => Promise<
      { ok: true; data: { person: Person } } | { ok: false; error: PeopleApiError }
    >,
  ) => {
    setActionError(null);
    const result = await action();
    if (!result.ok) return setActionError(result.error);
    applied(result.data.person);
  };

  if (error) return <ErrorNotice error={error} onRetry={() => setReload((value) => value + 1)} />;
  if (!person) {
    return (
      <div className="flex flex-col gap-3 p-4 sm:p-6" aria-label="Loading person">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const label = personLabel(person);
  return (
    <article aria-labelledby="person-heading" className="flex flex-col gap-6 p-4 sm:p-6">
      <Link to="/people" className="inline-flex items-center gap-1 text-sm font-semibold lg:hidden">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> All People
      </Link>
      {person.mergedIntoId ? (
        <StatusNotice
          tone="info"
          title="Merged Into Someone Else"
          action={
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(`/people/${person.mergedIntoId}`)}
              >
                Open Them
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void run(() => unmerge(person.id))}
              >
                Unmerge
              </Button>
            </div>
          }
        >
          This person's phones, email and history show on the person they were merged into.
        </StatusNotice>
      ) : null}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="person-heading" className="wl-display-4 break-words">
            {label}
          </h2>
          {person.company ? (
            <p className="text-[var(--wireline-color-text-secondary)]">{person.company}</p>
          ) : null}
          {person.status === "archived" ? <Badge variant="outline">Archived</Badge> : null}
        </div>
        {!person.mergedIntoId ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMerging(true)}>
              <GitMerge aria-hidden="true" /> Merge
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void run(() =>
                  updatePerson(person.id, {
                    status: person.status === "archived" ? "active" : "archived",
                  }),
                )
              }
            >
              {person.status === "archived" ? "Restore" : "Archive"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden="true" /> Delete
            </Button>
          </div>
        ) : null}
      </header>
      {actionError ? <ConflictNotice error={actionError} /> : null}

      {person.summary ? (
        <section aria-label="Summary">
          <p className="whitespace-pre-line">{person.summary}</p>
        </section>
      ) : null}

      <section aria-labelledby="person-contact-heading" className="flex flex-col gap-2">
        <h2 id="person-contact-heading" className="text-base font-semibold">
          Phones and Email
        </h2>
        <ul className="flex flex-col gap-1">
          {person.identifiers.map((identifier) => (
            <li key={identifier.id} className="flex items-center gap-2">
              {identifier.kind === "phone" ? (
                <Phone aria-hidden="true" className="h-4 w-4 shrink-0" />
              ) : (
                <Mail aria-hidden="true" className="h-4 w-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 break-all">
                {identifierText(identifier.kind, identifier.value)}
              </span>
              {identifier.personId !== person.id ? <Badge variant="outline">Merged</Badge> : null}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${identifierText(identifier.kind, identifier.value)}`}
                onClick={() => void run(() => removeIdentifier(person.id, identifier.id))}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
          {!person.identifiers.length ? (
            <li className="text-sm text-[var(--wireline-color-text-secondary)]">
              Add a phone or email so your Bot can link conversations to this person.
            </li>
          ) : null}
        </ul>
        {!person.mergedIntoId ? (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newValue.trim()) return;
              void run(async () => {
                const result = await addIdentifier(person.id, newKind, newValue.trim());
                if (result.ok) setNewValue("");
                return result;
              });
            }}
          >
            <label className="sr-only" htmlFor="person-new-kind">
              Type
            </label>
            <NativeSelect
              id="person-new-kind"
              className="w-auto"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value === "email" ? "email" : "phone")}
            >
              <option value="phone">Phone</option>
              <option value="email">Email</option>
            </NativeSelect>
            <label className="sr-only" htmlFor="person-new-value">
              {newKind === "phone" ? "Phone number" : "Email address"}
            </label>
            <Input
              id="person-new-value"
              className="min-w-0 flex-1"
              value={newValue}
              inputMode={newKind === "phone" ? "tel" : "email"}
              placeholder={newKind === "phone" ? "(312) 555-0101" : "name@example.com"}
              onChange={(e) => setNewValue(e.target.value)}
            />
            <Button type="submit" size="sm" variant="outline" disabled={!newValue.trim()}>
              Add
            </Button>
          </form>
        ) : null}
      </section>

      {Object.keys(person.customFields).length ? (
        <section aria-labelledby="person-details-heading" className="flex flex-col gap-2">
          <h2 id="person-details-heading" className="text-base font-semibold">
            Details
          </h2>
          <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-1 text-sm">
            {Object.entries(person.customFields).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="font-medium text-[var(--wireline-color-text-secondary)]">{key}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {person.mergedPeople?.length ? (
        <section aria-labelledby="person-merged-heading" className="flex flex-col gap-2">
          <h2 id="person-merged-heading" className="text-base font-semibold">
            Merged Duplicates
          </h2>
          <ul className="flex flex-col gap-1">
            {person.mergedPeople
              .filter((merged) => merged.mergedIntoId === person.id)
              .map((merged) => (
                <li key={merged.id} className="flex items-center gap-2">
                  <Link
                    to={`/people/${merged.id}`}
                    className="min-w-0 flex-1 font-medium underline-offset-4 hover:underline"
                  >
                    {merged.displayName || "Unnamed Person"}
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void run(async () => {
                        const result = await unmerge(merged.id);
                        return result.ok ? getPerson(person.id) : result;
                      })
                    }
                  >
                    Unmerge
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <PersonTimeline person={person} reloadKey={timelineKey} />

      <EditPersonDialog
        person={person}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={(next) => {
          setEditing(false);
          applied(next);
        }}
      />
      <MergeDialog
        person={person}
        open={merging}
        onClose={() => setMerging(false)}
        onMerged={(target) => {
          setMerging(false);
          onChanged();
          navigate(`/people/${target.id}`);
        }}
      />
      <ConfirmModal
        open={confirmDelete}
        danger
        loading={deleting}
        title={`Delete ${label}?`}
        message="This removes the person, their notes and their phone and email links from People. Calls, texts, email and bookings stay where they are."
        confirmLabel="Delete Person"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setDeleting(true);
          void deletePerson(person.id).then((result) => {
            setDeleting(false);
            setConfirmDelete(false);
            if (!result.ok) return setActionError(result.error);
            onDeleted();
          });
        }}
      />
    </article>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function PeoplePage() {
  const { personId } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PeopleSuggestion[]>([]);
  const [error, setError] = useState<PeopleApiError | null>(null);
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState<{
    displayName?: string;
    phone?: string;
    email?: string;
    source?: string;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // "Save to People" on a call, text or email lands here with the form filled.
  useEffect(() => {
    const kind = searchParams.get("add");
    const value = searchParams.get("value")?.trim();
    if ((kind !== "phone" && kind !== "email") || !value) return;
    setAdding({
      displayName: searchParams.get("name")?.trim() || undefined,
      phone: kind === "phone" ? value : undefined,
      email: kind === "email" ? value : undefined,
    });
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("add");
        next.delete("value");
        next.delete("name");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        setError(null);
        void listPeople({ q: query.trim() || undefined, status }, controller.signal)
          .then((result) => {
            if (controller.signal.aborted) return;
            if (!result.ok) return setError(result.error);
            setPeople(result.data.people);
            setCursor(result.data.nextCursor);
          })
          .catch(() => {});
      },
      query ? 250 : 0,
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, status, reload]);

  useEffect(() => {
    const controller = new AbortController();
    void listSuggestions(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result.ok) setSuggestions(result.data.suggestions);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [reload]);

  const loadMore = async () => {
    if (!cursor) return;
    const result = await listPeople({ q: query.trim() || undefined, status, cursor });
    if (!result.ok) return setError(result.error);
    setPeople((current) => [...(current ?? []), ...result.data.people]);
    setCursor(result.data.nextCursor);
  };

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const showSuggestions = !query && status === "active" && suggestions.length > 0;
  const addFromSuggestion = useMemo(
    () => (suggestion: PeopleSuggestion) =>
      setAdding({
        displayName: suggestion.nameHint ?? undefined,
        phone: suggestion.kind === "phone" ? suggestion.value : undefined,
        email: suggestion.kind === "email" ? suggestion.value : undefined,
        source: suggestion.sources[0],
      }),
    [],
  );

  return (
    <WorkspaceShell contentClassName="pt-0 pb-0" fullBleed>
      <WorkspacePageFrame
        mode="operate"
        className="flex min-h-0 flex-1 flex-col !gap-0 !px-0 sm:!px-0 lg:!px-0 !pt-0 pb-0"
      >
        <WorkspaceOperateIntro title="People" titleHidden />
        {error ? <ErrorNotice error={error} onRetry={refresh} /> : null}
        <div className="flex min-h-0 flex-1">
          <aside
            aria-label="People"
            className={cn(
              "flex min-h-0 w-full flex-col border-r border-border/80 lg:w-[360px] lg:shrink-0",
              personId ? "hidden lg:flex" : "flex",
            )}
          >
            <div className="flex flex-col gap-2 border-b border-border/80 p-3">
              <SearchField
                ref={searchRef}
                aria-label="Search people"
                placeholder="Search by name, phone or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClear={() => setQuery("")}
              />
              <div className="flex items-center justify-between gap-2">
                <div role="group" aria-label="Show" className="flex gap-1">
                  {(["active", "archived"] as const).map((value) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={status === value ? "secondary" : "ghost"}
                      aria-pressed={status === value}
                      onClick={() => setStatus(value)}
                    >
                      {value === "active" ? "Active" : "Archived"}
                    </Button>
                  ))}
                </div>
                <Button size="sm" onClick={() => setAdding({})}>
                  <Plus aria-hidden="true" /> Add Person
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {showSuggestions ? (
                <section
                  aria-labelledby="people-suggestions-heading"
                  className="border-b border-border/80 p-3"
                >
                  <h2 id="people-suggestions-heading" className="text-sm font-semibold">
                    Recent Contacts Not in People
                  </h2>
                  <ul className="mt-2 flex flex-col gap-1">
                    {suggestions.slice(0, 8).map((suggestion) => (
                      <li
                        key={`${suggestion.kind}:${suggestion.value}`}
                        className="flex items-center gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {suggestion.nameHint ??
                              identifierText(suggestion.kind, suggestion.value)}
                          </p>
                          <p className="truncate text-xs text-[var(--wireline-color-text-secondary)]">
                            {suggestion.nameHint
                              ? `${identifierText(suggestion.kind, suggestion.value)} · `
                              : ""}
                            {suggestion.sources.map((source) => SOURCE_LABELS[source]).join(", ")} ·{" "}
                            {formatRelative(suggestion.lastSeenAt)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addFromSuggestion(suggestion)}
                        >
                          Save
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {people === null && !error ? (
                <div className="flex flex-col gap-2 p-3" aria-label="Loading people">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : null}
              {people && !people.length ? (
                <div className="flex flex-col items-center gap-2 p-6 text-center">
                  <Users
                    aria-hidden="true"
                    className="h-8 w-8 text-[var(--wireline-color-text-secondary)]"
                  />
                  <p className="font-semibold">{query ? "No One Matches" : "No People Yet"}</p>
                  <p className="text-sm text-[var(--wireline-color-text-secondary)]">
                    {query
                      ? "Try a name, part of a phone number or an email address."
                      : "Save the people your Bot talks to and see every call, text, email and booking with them in one place."}
                  </p>
                </div>
              ) : null}
              {people?.length ? (
                <ul aria-label="People list" className="flex flex-col">
                  {people.map((person) => (
                    <li key={person.id}>
                      <Link
                        to={`/people/${person.id}`}
                        aria-current={person.id === personId ? "page" : undefined}
                        className={cn(
                          "flex min-h-14 flex-col justify-center border-b border-border/60 px-4 py-2 hover:bg-[var(--wireline-color-action-primary-container)]",
                          person.id === personId &&
                            "bg-[var(--wireline-color-action-primary-container)]",
                        )}
                      >
                        <span className="truncate font-semibold">{personLabel(person)}</span>
                        <span className="truncate text-sm text-[var(--wireline-color-text-secondary)]">
                          {personSubtitle(person)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {cursor ? (
                <div className="flex justify-center p-3">
                  <Button size="sm" variant="outline" onClick={() => void loadMore()}>
                    Show More
                  </Button>
                </div>
              ) : null}
            </div>
          </aside>
          <section
            aria-label="Person"
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain",
              personId ? "block" : "hidden lg:block",
            )}
          >
            {personId ? (
              <PersonDetail
                key={personId}
                personId={personId}
                onChanged={refresh}
                onDeleted={() => {
                  refresh();
                  navigate("/people");
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <Users
                  aria-hidden="true"
                  className="h-10 w-10 text-[var(--wireline-color-text-secondary)]"
                />
                <p className="font-semibold">Choose a Person</p>
                <p className="max-w-sm text-sm text-[var(--wireline-color-text-secondary)]">
                  Their calls, texts, email, bookings and notes appear together here.
                </p>
              </div>
            )}
          </section>
        </div>
      </WorkspacePageFrame>
      <AddPersonDialog
        open={adding !== null}
        initial={adding}
        onClose={() => setAdding(null)}
        onCreated={(person) => {
          setAdding(null);
          refresh();
          navigate(`/people/${person.id}`);
        }}
      />
    </WorkspaceShell>
  );
}
