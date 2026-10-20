import { useCallback, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { Check, Loader2 } from "lucide-react";
import { Button } from "./atoms";
import OutboundDialDialog from "./OutboundDialDialog";
import { AGENTS_CHANGED_EVENT } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";

export type StudioProposals = {
  changes?: unknown[];
  toolToggles?: unknown[];
  actions?: unknown[];
};

export type StudioProposalOperation = {
  snapshot: { pending: boolean; saved: boolean; error: string | null };
  listeners: Set<() => void>;
};

type ReviewItem = {
  key: string;
  label: string;
  value: string;
  path: string;
  body: Record<string, string | boolean>;
};
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function ReviewCard({
  item,
  agentId,
  messageId,
  operation,
}: {
  item: ReviewItem;
  agentId: string;
  messageId: string;
  operation: StudioProposalOperation;
}) {
  const subscribe = useCallback(
    (listener: () => void) => {
      operation.listeners.add(listener);
      return () => {
        operation.listeners.delete(listener);
      };
    },
    [operation],
  );
  const { pending, saved, error } = useSyncExternalStore(
    subscribe,
    () => operation.snapshot,
    () => operation.snapshot,
  );
  const update = (snapshot: StudioProposalOperation["snapshot"]) => {
    operation.snapshot = snapshot;
    operation.listeners.forEach((listener) => listener());
  };

  const save = async () => {
    if (operation.snapshot.pending || operation.snapshot.saved) return;
    update({ pending: true, saved: false, error: null });
    try {
      const persistedMessage = /^[1-9]\d*$/.test(messageId);
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/workspace/${item.path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...item.body,
            ...(persistedMessage ? { proposalMessageId: messageId, proposalKey: item.key } : {}),
          }),
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok)
        throw new Error((record(payload) && text(payload.error)) || "Could not save. Try again.");
      const confirmed =
        record(payload) &&
        payload.success === true &&
        (!persistedMessage || payload.savedProposalKey === item.key) &&
        (item.path === "apply-change"
          ? payload.field === item.body.field && String(payload.value) === String(item.body.value)
          : payload.tool === item.body.tool &&
            payload.enable === item.body.enable &&
            (payload.previouslySaved === true ||
              (Array.isArray(payload.enabledTools) &&
                payload.enabledTools.includes(item.body.tool) === item.body.enable)));
      if (!confirmed) throw new Error("Save was not confirmed. Try again.");
      // Persist the receipt in this Bot's session even if its workroom was closed
      // while the server completed the write. Never label another Bot as saved.
      update({ pending: false, saved: true, error: null });
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
    } catch (reason) {
      update({
        pending: false,
        saved: false,
        error: reason instanceof Error ? reason.message : "Could not save. Try again.",
      });
    }
  };

  return (
    <section
      aria-label={`Review ${item.label}`}
      className="min-w-0 rounded-xl border border-border bg-card p-3"
    >
      <p className="text-sm font-semibold text-foreground">{item.label}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
        {item.value}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {saved ? (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Check className="size-3.5" aria-hidden="true" />
            Saved
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-label={`Save ${item.label}`}
            disabled={pending}
            onClick={() => void save()}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            {pending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-2 break-words text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export default function StudioProposalReview({
  agentId,
  proposals,
  messageId,
  savedProposalKeys,
  operations,
}: {
  agentId: string;
  proposals: StudioProposals;
  messageId: string;
  savedProposalKeys?: string[];
  operations: Map<string, StudioProposalOperation>;
}) {
  const [call, setCall] = useState<Record<string, unknown> | null>(null);
  const changes: ReviewItem[] = (proposals.changes || []).flatMap((value, index) => {
    if (!record(value) || !text(value.field) || !text(value.label) || !text(value.value)) return [];
    return [
      {
        key: `change-${index}`,
        label: text(value.label),
        value: text(value.value),
        path: "apply-change",
        body: { field: text(value.field), value: text(value.value) },
      },
    ];
  });
  const toggles: ReviewItem[] = (proposals.toolToggles || []).flatMap((value, index) => {
    if (
      !record(value) ||
      !text(value.tool) ||
      !text(value.label) ||
      typeof value.enable !== "boolean"
    )
      return [];
    return [
      {
        key: `tool-${index}`,
        label: text(value.label),
        value: `${value.enable ? "Enable" : "Disable"} this capability.${text(value.reason) ? ` ${text(value.reason)}` : ""}`,
        path: "toggle-tool",
        body: { tool: text(value.tool), enable: value.enable },
      },
    ];
  });
  const actions = (proposals.actions || []).filter(
    (value): value is Record<string, unknown> =>
      record(value) &&
      ["send_email", "send_text_message", "make_call"].includes(text(value.kind)) &&
      !!text(value.label),
  );

  return (
    <div className="mt-3 min-w-0 space-y-3">
      {[...changes, ...toggles].map((item) => {
        const key = `${messageId}:${item.key}`;
        let operation = operations.get(key);
        if (!operation) {
          operation = {
            snapshot: {
              pending: false,
              saved: savedProposalKeys?.includes(item.key) === true,
              error: null,
            },
            listeners: new Set(),
          };
          operations.set(key, operation);
        }
        return (
          <ReviewCard
            key={item.key}
            item={item}
            agentId={agentId}
            messageId={messageId}
            operation={operation}
          />
        );
      })}
      {actions.map((action, index) => (
        <section
          key={`action-${index}`}
          aria-label={`Draft ${text(action.label)}`}
          className="min-w-0 rounded-xl border border-border bg-card p-3"
        >
          <p className="text-sm font-semibold">{text(action.label)}</p>
          {text(action.to) ? (
            <p className="mt-2 break-all text-xs text-muted-foreground">To: {text(action.to)}</p>
          ) : null}
          {text(action.subject) ? (
            <p className="mt-2 break-words text-sm font-medium">{text(action.subject)}</p>
          ) : null}
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">
            {text(action.body) || text(action.context)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Draft only. Nothing has been sent.</p>
          {action.kind === "make_call" ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => setCall(action)}
            >
              Review call
            </Button>
          ) : (
            <Link
              to="/inbox"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline wl-focus-ring-halo"
            >
              Open Inbox
            </Link>
          )}
        </section>
      ))}
      <OutboundDialDialog
        open={!!call}
        onClose={() => setCall(null)}
        initialAgentId={agentId}
        initialNumber={text(call?.to)}
        initialContext={text(call?.context)}
      />
    </div>
  );
}
