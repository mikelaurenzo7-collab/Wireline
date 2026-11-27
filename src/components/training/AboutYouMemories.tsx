import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "../atoms";
import { authFetch, readApiJson } from "../../lib/api";
import {
  ownerMemoryListSchema,
  OWNER_MEMORY_LIMIT,
  type OwnerMemory,
} from "../../lib/owner-memory";

/**
 * Knowledge > About You: what the Bot remembers about its owner. These notes
 * are private (the Workspace chat and computer tasks use them; customers never
 * hear them). The owner adds one by telling the Bot in chat or hands-free, and
 * reviews or forgets them here. Keyed by Bot by the parent so a late response
 * cannot cross identities.
 */
export default function AboutYouMemories({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const [memories, setMemories] = useState<OwnerMemory[] | null>(null);
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
        if (!receipt.success) throw new Error("About You could not be loaded. Try refreshing.");
        setMemories(receipt.data.memories);
        setError(null);
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "About You could not load.");
      }
    })();
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [endpoint, revision]);

  async function forget(id: string) {
    if (busy.current || memories === null) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await readApiJson<{ memories: OwnerMemory[] }>(
        await authFetch(`${endpoint}/${encodeURIComponent(id)}`, { method: "DELETE" }),
      );
      if (!mounted.current) return;
      if (!result.ok) throw new Error(result.error);
      const receipt = ownerMemoryListSchema.safeParse(result.data);
      if (!receipt.success)
        throw new Error("The change could not be confirmed. Refresh before retrying.");
      setMemories(receipt.data.memories);
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "The change could not be confirmed. Refresh before retrying.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <section
      className="wl-paper wl-paper-elevated grid gap-3 p-5"
      aria-labelledby="about-you-title"
    >
      <h2 id="about-you-title" className="text-base font-semibold leading-6 text-foreground">
        About You
      </h2>
      <p className="text-xs text-muted-foreground">
        Private notes {agentName} keeps about you for your chats and computer tasks. Customers never
        hear them. To add one, tell {agentName} in chat, for example &ldquo;Remember that I like
        short updates.&rdquo;
      </p>
      {error ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{error}</p>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh
          </Button>
        </div>
      ) : null}
      {memories === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          {error ? "About You is unavailable." : "Loading…"}
        </p>
      ) : memories.length ? (
        <>
          <ul className="grid gap-2">
            {memories.map((note) => (
              <li
                key={note.id}
                className="flex items-start gap-2 rounded-lg border border-border px-3 py-2"
              >
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
                  {note.content}
                </p>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={pending}
                  aria-label={`Forget: ${note.content}`}
                  onClick={() => void forget(note.id)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {memories.length}/{OWNER_MEMORY_LIMIT} notes. Forgetting a note does not change earlier
            conversations or task results.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
      )}
    </section>
  );
}
