import { useEffect, useState } from "react";
import { FolderInput, History } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTitle, DialogTrigger, Input } from "../atoms";
import { authFetch } from "../../lib/api";

type Chat = { id: string; title: string; project: string | null; updatedAt: string };

export default function StudioChatHistory({
  agentId,
  disabled,
  onSelect,
}: {
  agentId: string;
  disabled: boolean;
  onSelect: (id: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [page, setPage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [project, setProject] = useState("");
  const [saving, setSaving] = useState(false);
  const url = `/api/agents/${encodeURIComponent(agentId)}/workspace/messages`;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ view: "history" });
        if (page) query.set("before", page);
        const response = await authFetch(`${url}?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!Array.isArray(result.threads)) throw new Error();
        if (controller.signal.aborted) return;
        setChats((previous) =>
          page
            ? [...new Map([...previous, ...result.threads].map((chat) => [chat.id, chat])).values()]
            : result.threads,
        );
        setCursor(result.nextCursor);
      } catch {
        if (!controller.signal.aborted) setError("Chat history could not load.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [open, page, retry, url]);

  async function saveProject(id: string) {
    setSaving(true);
    setError("");
    try {
      const response = await authFetch(`${url}?thread=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project }),
      });
      if (!response.ok) throw new Error();
      const saved = await response.json();
      setChats((previous) =>
        previous.map((chat) => (chat.id === id ? { ...chat, project: saved.project } : chat)),
      );
      setEditing(null);
    } catch {
      setError("The project could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const folders = new Map<string | null, Chat[]>();
  for (const chat of chats) {
    const group = folders.get(chat.project);
    if (group) group.push(chat);
    else folders.set(chat.project, [chat]);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (next) {
          setPage(null);
          setCursor(null);
          setChats([]);
          setLoading(true);
          setError("");
          setEditing(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={disabled} className="min-h-11">
          <History aria-hidden="true" />
          Chat history
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Chat history</DialogTitle>
        {error && (
          <p role="alert">
            {error}{" "}
            {!editing && (
              <Button size="sm" variant="ghost" onClick={() => setRetry((n) => n + 1)}>
                Retry
              </Button>
            )}
          </p>
        )}
        {!chats.length && !error && (
          <p role="status">
            {loading ? "Loading chats…" : "Your chats will appear here after you send a message."}
          </p>
        )}
        {[...folders].map(([name, items]) => (
          <section key={JSON.stringify(name)} className="min-w-0">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {name || "Unfiled chats"}
            </h3>
            <ul>
              {items.map((chat) => (
                <li key={chat.id} className="border-b border-border py-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="wl-focus-ring-halo min-h-11 min-w-0 flex-1 break-words rounded px-1 text-left"
                      disabled={saving}
                      onClick={() => {
                        if (onSelect(chat.id)) setOpen(false);
                      }}
                    >
                      {chat.title}
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      aria-label={`Move ${chat.title} to project`}
                      title="Move to project"
                      onClick={() => {
                        setEditing(chat.id);
                        setProject(chat.project || "");
                        setError("");
                      }}
                    >
                      <FolderInput aria-hidden="true" />
                    </Button>
                  </div>
                  {editing === chat.id && (
                    <form
                      className="flex flex-wrap items-end gap-2 pb-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveProject(chat.id);
                      }}
                    >
                      <label className="min-w-0 flex-1 text-sm">
                        Project name
                        <Input
                          value={project}
                          maxLength={80}
                          list="studio-chat-projects"
                          placeholder="Unfiled chats"
                          onChange={(event) => setProject(event.target.value)}
                        />
                      </label>
                      <Button size="sm" type="submit" disabled={saving}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <datalist id="studio-chat-projects">
          {[...folders.keys()].map((name) => name && <option key={name} value={name} />)}
        </datalist>
        {cursor && (
          <Button disabled={loading || saving} variant="secondary" onClick={() => setPage(cursor)}>
            Older chats
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
