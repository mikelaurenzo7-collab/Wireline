import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";

import { authFetch, readApiJson } from "../lib/api";
import {
  clearPendingEmailReplyOperation,
  loadPendingEmailReplyOperation,
  savePendingEmailReplyOperation,
} from "../lib/email-reply-operation";
import { Button, Textarea } from "./atoms";
import { StatusNotice } from "./molecules";

/** Mirrors the server's EMAIL_REPLY_MAX_CHARS. */
export const EMAIL_REPLY_MAX_CHARS = 10_000;

export type SentEmailReply = {
  id: string;
  threadId: string;
  role: "owner";
  content: string;
  createdAt: string;
};

type ReplyResponse = {
  status?: string;
  threaded?: boolean;
  message?: { id?: unknown; content?: unknown; created_at?: unknown };
};

type ComposerError = { title: string; message: string };

function newOperationKey(): string {
  return crypto.randomUUID();
}

function unresolvedReplyNotice(): ComposerError {
  return {
    title: "Reply Status Unknown",
    message:
      "A previous reply may still arrive, even if it is not in Sent yet. Check the mailbox's Sent folder before enabling another reply.",
  };
}

/**
 * Reply to one inbox conversation from the mailbox that received it. Each
 * composed reply carries one operation key: retrying the same text after an
 * error or a dropped connection can never send it twice, while editing the
 * text after a failure makes it a new reply with a new key.
 */
export default function EmailReplyComposer({
  threadId,
  recipient,
  onSent,
}: {
  threadId: string;
  recipient: string;
  onSent: (message: SentEmailReply) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [error, setError] = useState<ComposerError | null>(() =>
    loadPendingEmailReplyOperation(threadId) ? unresolvedReplyNotice() : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState(
    () => loadPendingEmailReplyOperation(threadId) !== null,
  );
  const operationKey = useRef(loadPendingEmailReplyOperation(threadId) ?? newOperationKey());
  const submittedBody = useRef<string | null>(null);

  // Another conversation starts a fresh reply, never a stale key or draft.
  useEffect(() => {
    setDraft("");
    const pendingOperation = loadPendingEmailReplyOperation(threadId);
    setError(pendingOperation ? unresolvedReplyNotice() : null);
    setNotice(null);
    setUnresolved(pendingOperation !== null);
    operationKey.current = pendingOperation ?? newOperationKey();
    submittedBody.current = null;
  }, [threadId]);

  const body = draft.trim();
  const tooLong = body.length > EMAIL_REPLY_MAX_CHARS;

  async function confirmSentFolderChecked() {
    if (acknowledging) return;
    setAcknowledging(true);
    setError(null);
    try {
      const response = await authFetch(
        `/api/emails/threads/${encodeURIComponent(threadId)}/reply/acknowledge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner_confirmed_sent_check: true }),
        },
      );
      const result = await readApiJson<{ acknowledged?: unknown }>(response);
      if (!result.ok || result.data.acknowledged !== true) {
        setError({
          title: "Reply Still Paused",
          message: result.ok
            ? "The unresolved reply was not acknowledged. Keep checking the Sent folder and try again."
            : result.error,
        });
        return;
      }
      if (!clearPendingEmailReplyOperation(threadId)) {
        setError({
          title: "Reply Still Paused",
          message:
            "The mailbox check was recorded, but your browser could not clear its retry token. Try this confirmation again to finish safely.",
        });
        return;
      }
      setUnresolved(false);
      setError(null);
      operationKey.current = newOperationKey();
      submittedBody.current = null;
    } catch {
      setError({
        title: "Reply Still Paused",
        message: "We could not record the mailbox check. Keep the reply paused and try again.",
      });
    } finally {
      setAcknowledging(false);
    }
  }

  async function send() {
    if (!body || tooLong || sending || unresolved) return;
    if (submittedBody.current !== null && submittedBody.current !== body) {
      operationKey.current = newOperationKey();
    }
    submittedBody.current = body;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      if (!savePendingEmailReplyOperation(threadId, operationKey.current)) {
        setError({
          title: "Reply Not Sent",
          message:
            "Your browser couldn't save a safe retry token. Enable session storage for this site, then try again.",
        });
        return;
      }
      const response = await authFetch(
        `/api/emails/threads/${encodeURIComponent(threadId)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, operation_key: operationKey.current }),
        },
      );
      const result = await readApiJson<ReplyResponse>(response);
      if (!result.ok) {
        const mayHaveSent = result.code === "EMAIL_REPLY_UNRESOLVED";
        if (mayHaveSent) {
          setUnresolved(true);
        } else {
          clearPendingEmailReplyOperation(threadId);
        }
        setError({
          title: mayHaveSent ? "Reply May Have Been Sent" : "Reply Not Sent",
          message: result.error,
        });
        return;
      }
      const message = result.data.message;
      if (!message || typeof message.id !== "string" || typeof message.content !== "string") {
        setUnresolved(true);
        setError(unresolvedReplyNotice());
        return;
      }
      clearPendingEmailReplyOperation(threadId);
      onSent({
        id: message.id,
        threadId,
        role: "owner",
        content: message.content,
        createdAt: typeof message.created_at === "string" ? message.created_at : "",
      });
      setDraft("");
      operationKey.current = newOperationKey();
      submittedBody.current = null;
      if (result.data.threaded === false) {
        setNotice(
          "Sent with “Re:” in the subject. The original email couldn't be found, so it may appear as a new conversation for the customer.",
        );
      }
    } catch {
      setUnresolved(true);
      setError(unresolvedReplyNotice());
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className="grid gap-2 border-b border-border p-3 sm:p-4"
      aria-label="Reply to this conversation"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {error ? (
        <StatusNotice
          tone="destructive"
          title={error.title}
          action={
            unresolved ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void confirmSentFolderChecked()}
                disabled={acknowledging}
              >
                {acknowledging ? "Recording check…" : "I checked Sent; enable a new reply"}
              </Button>
            ) : undefined
          }
        >
          {error.message}
        </StatusNotice>
      ) : null}
      {notice ? <StatusNotice tone="info">{notice}</StatusNotice> : null}
      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        <span>
          Reply to <span className="font-semibold text-foreground">{recipient}</span>
        </span>
        <Textarea
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setNotice(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
          disabled={sending}
          readOnly={unresolved}
          rows={3}
          state={tooLong ? "invalid" : "default"}
          placeholder="Write your reply"
          className="min-h-20"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={
            tooLong
              ? "text-xs text-[var(--wireline-color-status-error)]"
              : "text-xs text-muted-foreground"
          }
        >
          {tooLong
            ? `Shorten this reply to ${EMAIL_REPLY_MAX_CHARS.toLocaleString("en-US")} characters.`
            : "Sends from this conversation's mailbox."}
        </p>
        <Button
          type="submit"
          disabled={!body || tooLong || sending || unresolved}
          aria-busy={sending}
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          {sending ? "Sending…" : unresolved ? "Check Mailbox First" : "Send Reply"}
        </Button>
      </div>
    </form>
  );
}
