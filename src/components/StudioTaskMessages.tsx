import { CheckCircle2, ExternalLink, Globe } from "lucide-react";
import { Button } from "./atoms";
import TaskResultText from "./computer/TaskResultText";
import LinkifiedText from "./ui/LinkifiedText";
import BotMark from "./BotMark";
import { ACTIVE_COMPUTER_TASKS, type ComputerTask } from "../contexts/ComputerWorkspaceContext";
import type { BotMarkKey } from "../lib/bot-mark";

export default function StudioTaskMessages({
  selected,
  agentId,
  agentName,
  markKey,
  onShowBrowser,
}: {
  selected: ComputerTask;
  agentId: string;
  agentName: string;
  markKey?: BotMarkKey | null;
  onShowBrowser: () => void;
}) {
  return (
    <>
      <article className="wl-studio-message is-owner ml-auto max-w-[84%]" aria-label="Your task">
        <div className="wl-studio-message__body">
          <LinkifiedText>
            {selected.preparingBrowser ? "Open a browser." : selected.goal}
          </LinkifiedText>
        </div>
      </article>
      <article className="wl-studio-message is-bot" aria-label={`${agentName} task activity`}>
        {selected.events.some((event) => event.kind === "action" || event.kind === "note") ? (
          <details className="wl-work-steps">
            <summary>
              {selected.actionCount} browser {selected.actionCount === 1 ? "action" : "actions"}
              {ACTIVE_COMPUTER_TASKS.includes(selected.status) ? " · In progress" : ""}
            </summary>
            <ol>
              {selected.events
                .filter((event) => event.kind === "action" || event.kind === "note")
                .map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    <LinkifiedText>{event.text}</LinkifiedText>
                  </li>
                ))}
            </ol>
          </details>
        ) : null}
        {selected.events
          .filter((event) => event.kind === "reply")
          .map((event, index) => (
            <p key={`${event.at}-${index}`} className="wl-work-owner-reply">
              <span>Your reply</span> {event.text}
            </p>
          ))}
        {selected.status === "running" ? (
          <p className="wl-work-current-step" role="status">
            <BotMark
              seed={agentId}
              name={agentName}
              markKey={markKey}
              size={20}
              working={!selected.ownerControl && !selected.stopping}
              decorative
            />
            <span>
              {selected.stopping
                ? "Stopping after the current step…"
                : selected.ownerControl
                  ? "You control the browser."
                  : [...selected.events]
                      .reverse()
                      .find((event) => event.kind === "action" || event.kind === "note")?.text ||
                    "Opening the browser…"}
            </span>
          </p>
        ) : null}
        {selected.status === "needs_input" ? (
          <div className="wl-work-question">
            <TaskResultText>
              {selected.preparingBrowser
                ? "Browse first. Then give your Bot a task from this page."
                : selected.question || "Your Bot needs you to continue."}
            </TaskResultText>
            <Button type="button" size="sm" variant="secondary" onClick={onShowBrowser}>
              <Globe aria-hidden="true" />
              {selected.ownerControl ? "Open browser" : "Use browser controls"}
            </Button>
            {!selected.ownerControl ? (
              <p>
                Choose Computer task below to reply. Use browser control for passwords, codes, or
                private details.
              </p>
            ) : null}
          </div>
        ) : null}
        {selected.summary ? (
          <>
            <div className="wl-work-result-heading flex-wrap">
              {selected.status === "completed" ? (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              ) : null}
              <span>
                {selected.status === "completed"
                  ? "Completed"
                  : selected.status === "blocked"
                    ? "Needs your help"
                    : "Task outcome"}
              </span>
              {selected.finishedAt ? (
                <time
                  dateTime={selected.finishedAt}
                  className="text-xs font-normal text-muted-foreground"
                >
                  {new Date(selected.finishedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              ) : null}
            </div>
            <TaskResultText>{selected.summary}</TaskResultText>
          </>
        ) : !ACTIVE_COMPUTER_TASKS.includes(selected.status) ? (
          <p className="text-muted-foreground">
            {selected.status === "stopped"
              ? "Stopped before the task finished."
              : "This task ended before it finished. You can try a new task."}
          </p>
        ) : null}
        {selected.sources.length ? (
          <ul className="wl-work-sources" aria-label="Task sources">
            {selected.sources
              .filter((source) => {
                try {
                  const url = new URL(source);
                  return (
                    ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
                  );
                } catch {
                  return false;
                }
              })
              .map((source) => (
                <li key={source}>
                  <a href={source} target="_blank" rel="noopener noreferrer nofollow">
                    <Globe aria-hidden="true" />
                    <span>
                      {(() => {
                        try {
                          return new URL(source).hostname;
                        } catch {
                          return source;
                        }
                      })()}
                    </span>
                    <ExternalLink aria-hidden="true" />
                  </a>
                </li>
              ))}
          </ul>
        ) : null}
      </article>
    </>
  );
}
