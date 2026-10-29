import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "../atoms";
import { authFetch, readApiJson } from "../../lib/api";
import {
  ownerMemoryListSchema,
  OWNER_MEMORY_LIMIT,
  OWNER_MEMORY_MAX_CHARS,
  type OwnerMemory,
} from "../../lib/owner-memory";

/** Keyed by Bot by the parent so drafts and late responses cannot cross identities. */
export default function StudioMemoryEditor({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const [memories, setMemories] = useState<OwnerMemory[] | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  const busy = useRef(false);
  const endpoint = `/api/agents/${encodeURIComponent(agentId)}/workspace/memory`;
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await readApiJson<{ memories: OwnerMemory[] }>(
          await authFetch(endpoint, { signal: controller.signal }),
        );
        if (controller.signal.aborted) return;
        if (!result.ok) throw new Error(result.error);
        const receipt = ownerMemoryListSchema.safeParse(result.data);
        if (!receipt.success) throw new Error("Memory could not be loaded. Try refreshing.");
        setMemories(receipt.data.memories);
        setError(null);
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Memory could not load.");
      }
    })();
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [endpoint, revision]);

  async function change(id?: string) {
    if (busy.current || memories === null) return;
    busy.current = true;
    setPending(true);
    setError(null);
    const submitted = draft.trim();
    try {
      const result = await readApiJson<{ memories: OwnerMemory[] }>(
        await authFetch(id ? `${endpoint}/${encodeURIComponent(id)}` : endpoint, {
          method: id ? "DELETE" : "POST",
          ...(id
            ? {}
            : {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: submitted }),
              }),
        }),
      );
      if (!mounted.current) return;
      if (!result.ok) throw new Error(result.error);
      const receipt = ownerMemoryListSchema.safeParse(result.data);
      if (!receipt.success)
        throw new Error("The change could not be confirmed. Refresh memory before retrying.");
      setMemories(receipt.data.memories);
      if (!id) setDraft("");
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "The change could not be confirmed. Refresh memory before retrying.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <div className="wl-memory-editor" aria-label={`${agentName} saved memory`}>
      <p>
        Things you want {agentName} to remember in private chat and new computer tasks. Customer
        calls and email use Knowledge instead.
      </p>
      <p className="text-xs text-muted-foreground">
        Changes apply to future requests. Removing a note does not erase earlier conversations or
        task results.
      </p>
      {error ? (
        <div role="alert" className="space-y-2">
          <p>{error}</p>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh memory
          </Button>
        </div>
      ) : null}
      {memories === null ? (
        <p role="status">{error ? "Memory is unavailable." : "Loading memory…"}</p>
      ) : (
        <>
          {memories.length ? (
            <ul className="wl-memory-editor__notes">
              {memories.map((note) => (
                <li key={note.id}>
                  <p>{note.content}</p>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={pending}
                    aria-label={`Forget: ${note.content}`}
                    onClick={() => void change(note.id)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No saved memories yet. Add a preference or a detail you often repeat.
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim()) void change();
            }}
          >
            <label htmlFor={`memory-${agentId}`}>Remember this</label>
            <textarea
              id={`memory-${agentId}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={pending || memories.length >= OWNER_MEMORY_LIMIT}
              maxLength={OWNER_MEMORY_MAX_CHARS}
              rows={3}
              placeholder="For example: Keep my briefings concise and use Central time."
            />
            <div className="wl-memory-editor__footer">
              <span>
                {memories.length}/{OWNER_MEMORY_LIMIT} memories
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={pending || !draft.trim() || memories.length >= OWNER_MEMORY_LIMIT}
              >
                {pending ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Plus size={14} aria-hidden="true" />
                )}
                Save memory
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
