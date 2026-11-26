import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Plus } from "lucide-react";

import { authFetch } from "../../lib/api";
import { STUDIO_THREAD_PARAM, useStudioChatState } from "../../lib/studio-active-chat";

type Chat = { id: string; title: string; project: string | null };

/** Recent chats shown in the rail. The full list and projects live in Chat history. */
const RAIL_CHAT_LIMIT = 8;

/**
 * The selected Bot's recent chats, in the workspace rail. Studio opens on a
 * fresh chat, so this is where an owner picks a conversation back up. Chats
 * filed in a project are grouped under its name; everything else is listed by
 * most recent activity.
 */
export default function StudioChatRail({
  agentId,
  onStudio,
}: {
  agentId: string;
  onStudio: boolean;
}) {
  const { active, version } = useStudioChatState();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await authFetch(
          `/api/agents/${encodeURIComponent(agentId)}/workspace/messages?view=history`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (controller.signal.aborted) return;
        setChats(Array.isArray(result.threads) ? result.threads.slice(0, RAIL_CHAT_LIMIT) : []);
      } catch {
        // The rail is a shortcut. Chat history in Studio reports load failures.
        if (!controller.signal.aborted) setChats([]);
      } finally {
        if (!controller.signal.aborted) setLoaded(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [agentId, version]);

  const href = (target: string) =>
    `/studio?agent=${encodeURIComponent(agentId)}&${STUDIO_THREAD_PARAM}=${encodeURIComponent(target)}`;
  const openId = onStudio && active?.agentId === agentId ? active.threadId : null;
  const groups = new Map<string | null, Chat[]>();
  for (const chat of chats) {
    const group = groups.get(chat.project);
    if (group) group.push(chat);
    else groups.set(chat.project, [chat]);
  }

  return (
    <nav className="wl-shell-chat-rail" aria-label="Chats">
      <Link to={href("new")} className="wl-shell-chat-new wl-focus-ring-halo">
        <Plus size={16} aria-hidden="true" />
        <span>New chat</span>
      </Link>
      {loaded && chats.length > 0 ? (
        <div className="wl-shell-chat-list">
          {[...groups].map(([project, items]) => (
            <section key={JSON.stringify(project)} className="min-w-0">
              {project ? <h3 className="wl-shell-chat-project">{project}</h3> : null}
              <ul>
                {items.map((chat) => (
                  <li key={chat.id}>
                    <Link
                      to={href(chat.id)}
                      aria-current={openId === chat.id ? "page" : undefined}
                      data-wireline-chat-open={openId === chat.id ? "true" : undefined}
                      title={chat.title}
                      className="wl-shell-chat-link wl-focus-ring-halo"
                    >
                      {chat.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
