import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";

import { authFetch, readApiJson } from "../lib/api";
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
  const [error, setError] = useState<ComposerError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const operationKey = useRef(newOperationKey());
  const submittedBody = useRef<string | null>(null);

  // Another conversation starts a fresh reply, never a stale key or draft.
  useEffect(() => {
    setDraft("");
    setError(null);
    setNotice(null);
    operationKey.current = newOperationKey();
    submittedBody.current = null;
  }, [threadId]);

  const body = draft.trim();
  const tooLong = body.length > EMAIL_REPLY_MAX_CHARS;

  async function send() {
    if (!body || tooLong || sending) return;
    if (submittedBody.current !== null && submittedBody.current !== body) {
      operationKey.current = newOperationKey();
    }
    submittedBody.current = body;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
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
        setError(
          result.code === "EMAIL_REPLY_UNRESOLVED"
            ? { title: "Reply May Have Been Sent", message: result.error }
            : { title: "Reply Not Sent", message: result.error },
        );
        return;
      }
      const message = result.data.message;
      if (!message || typeof message.id !== "string" || typeof message.content !== "string") {
        setError({
          title: "Reply Status Unknown",
          message: "Try again with the same text; it won't send twice.",
        });
        return;
      }
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
      setError({
        title: "Reply Status Unknown",
        message:
          "The connection dropped while sending. Try again with the same text; it won't send twice.",
      });
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
        <StatusNotice tone="destructive" title={error.title}>
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
        <Button type="submit" disabled={!body || tooLong || sending} aria-busy={sending}>
          {sending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          {sending ? "Sending…" : "Send Reply"}
        </Button>
      </div>
    </form>
  );
}
