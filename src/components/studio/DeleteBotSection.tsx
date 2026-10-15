import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "../atoms";
import { StatusNotice } from "../molecules";
import { AGENTS_CHANGED_EVENT, useAgents } from "../../contexts/AgentsContext";
import { useToast } from "../../contexts/ToastContext";
import { authFetch } from "../../lib/api";
import { formatPhone } from "../../lib/safe-number";

type DeletionBlock = "live_call" | "outbound_call" | "computer_task" | "identity_setup";

type DeletionPreview = {
  name: string;
  phone_numbers: string[];
  mailboxes: string[];
  blocked_by: DeletionBlock | null;
};

const BLOCKED_MESSAGES: Record<DeletionBlock, string> = {
  live_call: "This Bot is on a call or still wrapping one up. Delete it after the call ends.",
  outbound_call: "This Bot is placing a call. Delete it after the call ends.",
  computer_task: "This Bot is working on a computer task. Stop the task, then delete the Bot.",
  identity_setup: "This Bot's number or mailbox is being set up. Try again in a minute.",
};

/**
 * Deleting a Bot frees its slot on the plan. The section loads what deletion
 * releases (number, managed mailbox) when it opens, so the confirmation names
 * the exact number and address that stop working.
 */
export default function DeleteBotSection({
  agentId,
  agentName,
  compact = false,
}: {
  agentId: string;
  agentName: string;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const { refresh } = useAgents();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // A failed deletion can still have released the number or mailbox, so the
  // preview reloads after one to show what is left.
  const [previewVersion, setPreviewVersion] = useState(0);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/deletion`);
        const body = (await response.json().catch(() => null)) as
          (DeletionPreview & { error?: string }) | null;
        if (!response.ok || !body) {
          throw new Error(body?.error || "Couldn't check what deleting this Bot releases.");
        }
        if (active) setPreview(body);
      } catch (err) {
        if (active) {
          setLoadError(
            err instanceof Error ? err.message : "Couldn't check what deleting this Bot releases.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [agentId, open, previewVersion]);

  async function deleteBot() {
    if (confirmation !== "DELETE" || deleting || !preview || preview.blocked_by) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Couldn't delete this Bot. Try again.");
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      refresh();
      toast({ type: "success", title: "Bot Deleted", message: `${agentName} was deleted.` });
      navigate("/studio", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this Bot. Try again.");
      setDeleting(false);
      setPreviewVersion((version) => version + 1);
    }
  }

  const blocked = preview?.blocked_by ?? null;
  // A refused deletion's error already starts with the busy explanation.
  const showBlocked = blocked && !error?.startsWith(BLOCKED_MESSAGES[blocked]);

  return (
    <section
      className={`${compact ? "rounded-xl p-3 sm:p-4" : "rounded-2xl p-5 sm:p-6"} border border-[var(--wireline-color-feedback-error-border)] bg-card`}
      aria-label="Delete Bot"
    >
      <details
        open={open}
        onToggle={(event) => {
          const opened = event.currentTarget.open;
          setOpen(opened);
          if (opened) setError(null);
        }}
        className="group"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md text-[var(--wireline-color-status-error)] wl-focus-ring-halo [&::-webkit-details-marker]:hidden">
          <h3 className={`${compact ? "text-sm" : "text-base"} font-semibold`}>Delete Bot</h3>
          <ChevronDown
            className="size-4 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="mt-3 grid gap-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Checking what this Bot uses…
            </p>
          ) : preview ? (
            <ul className="grid list-disc gap-1.5 pl-5 text-sm leading-6 text-muted-foreground marker:text-muted-foreground">
              <li>
                <span className="wl-preserve-case">{preview.name}</span>&apos;s training, lessons,
                workspace chat, and computer task history are deleted.
              </li>
              {preview.phone_numbers.map((phoneNumber) => (
                <li key={phoneNumber}>
                  Its number {formatPhone(phoneNumber)} is released and stops taking calls. A new
                  number for your next Bot follows the limit of one new number every 31 days.
                </li>
              ))}
              {preview.mailboxes.map((mailbox) => (
                <li key={mailbox}>
                  Its mailbox <span className="break-all">{mailbox}</span> and the email in it are
                  deleted.
                </li>
              ))}
              <li>Call history, texts, appointments, and leads stay in your account.</li>
              <li>This can&apos;t be undone.</li>
            </ul>
          ) : null}

          {blocked && showBlocked ? (
            <StatusNotice tone="warning" title="Bot Is Busy">
              {BLOCKED_MESSAGES[blocked]}
            </StatusNotice>
          ) : null}
          {loadError ? (
            <StatusNotice tone="destructive" title="Couldn't Check This Bot">
              {loadError}
            </StatusNotice>
          ) : null}
          {error ? (
            <StatusNotice tone="destructive" title="Bot Not Deleted">
              {error}
            </StatusNotice>
          ) : null}

          {preview && !blocked ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label
                className="grid gap-2 text-sm text-muted-foreground"
                htmlFor={`delete-bot-${agentId}`}
              >
                Type DELETE to Confirm
                <input
                  id={`delete-bot-${agentId}`}
                  value={confirmation}
                  disabled={deleting}
                  onChange={(event) => setConfirmation(event.target.value.toUpperCase())}
                  placeholder="DELETE"
                  autoComplete="off"
                  className="h-11 rounded-xl border border-border bg-background px-4 text-sm font-medium tracking-[0.18em] text-foreground outline-none focus:border-[var(--wireline-color-status-error)] sm:w-44"
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={confirmation !== "DELETE" || deleting}
                onClick={() => void deleteBot()}
                className="border-[var(--wireline-color-feedback-error-border)] text-[var(--wireline-color-status-error)] hover:bg-[var(--wireline-color-feedback-error-surface)]"
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 size={14} aria-hidden="true" />
                )}
                {deleting ? "Deleting…" : "Delete Bot"}
              </Button>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
