import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Headphones, Mic, Square, Volume2 } from "lucide-react";
import { Button } from "../atoms";
import { authFetch, readApiJson } from "../../lib/api";
import { ownerMemoryListSchema } from "../../lib/owner-memory";
import { HandsFreeSession } from "../../lib/hands-free-session";
import { browserHandsFreeAvailable, browserHandsFreeSpeech } from "../../lib/browser-hands-free";

type Props = {
  agentId: string;
  draft: string;
  onDraftChange: (text: string) => void;
  canSubmit: boolean;
  onSubmit: () => Promise<boolean>;
  sendPhrase: "send task" | "send message";
  maxLength: number;
  busy: boolean;
  responseKey?: string;
  response?: string;
  onActiveChange?: (active: boolean) => void;
};

/** Speech uses the same draft and server workflows as the real composer. */
export default function StudioHandsFree(props: Props) {
  const { onActiveChange } = props;
  const controlsId = useId();
  const [expanded, setExpanded] = useState(false);
  const current = useRef(props);
  current.current = props;
  const session = useMemo(
    () =>
      new HandsFreeSession(browserHandsFreeSpeech(), {
        getDraft: () => current.current.draft,
        setDraft: (text) => {
          current.current = { ...current.current, draft: text };
          current.current.onDraftChange(text);
        },
        sendPhrase: props.sendPhrase,
        maxLength: () => current.current.maxLength,
        canSubmit: () => current.current.canSubmit,
        submit: () => current.current.onSubmit(),
        saveNote: async (content) => {
          const agentId = props.agentId;
          const result = await readApiJson<unknown>(
            await authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/memory`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content }),
            }),
          );
          if (!result.ok) throw new Error(result.error);
          const receipt = ownerMemoryListSchema.safeParse(result.data);
          if (
            !receipt.success ||
            !receipt.data.memories.some((memory) => memory.content === content)
          )
            throw new Error("The note was not confirmed. Check Memory before trying again.");
        },
      }),
    [props.agentId, props.sendPhrase],
  );
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const available = browserHandsFreeAvailable();

  useLayoutEffect(() => {
    session.activate();
    return () => session.dispose();
  }, [session]);
  useEffect(() => {
    onActiveChange?.(snapshot.active);
    return () => onActiveChange?.(false);
  }, [onActiveChange, snapshot.active]);
  useEffect(() => {
    session.observe(props.responseKey || "", props.response || "", props.busy);
  }, [session, props.responseKey, props.response, props.busy]);
  useEffect(() => {
    const pauseHidden = () => {
      if (document.hidden && session.getSnapshot().active)
        session.stop("Listening paused because this page is hidden. Restart when you return.");
    };
    const pauseRoute = () => {
      if (session.getSnapshot().active)
        session.stop("Audio devices changed. Check your output and restart listening.");
    };
    const pausePage = () => session.stop();
    document.addEventListener("visibilitychange", pauseHidden);
    window.addEventListener("pagehide", pausePage);
    navigator.mediaDevices?.addEventListener?.("devicechange", pauseRoute);
    return () => {
      document.removeEventListener("visibilitychange", pauseHidden);
      window.removeEventListener("pagehide", pausePage);
      navigator.mediaDevices?.removeEventListener?.("devicechange", pauseRoute);
    };
  }, [session]);

  return (
    <div className="mb-2 min-w-0" data-testid="studio-hands-free">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={expanded}
        aria-controls={controlsId}
        onClick={() => {
          if (expanded) session.stop();
          setExpanded(!expanded);
        }}
      >
        <Headphones className="size-4" aria-hidden="true" />
        Hands-free{snapshot.active ? " · On" : ""}
      </Button>
      {expanded ? (
        <div
          id={controlsId}
          className="mt-2 max-h-[40dvh] space-y-3 overflow-y-auto rounded-xl border border-border bg-card p-3 text-sm"
          aria-label="Hands-free controls"
        >
          {!snapshot.active ? (
            <p className="text-xs text-muted-foreground">
              Dictate with your browser’s speech service and device voice. Keep this page open.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {!snapshot.active ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!available || snapshot.phase === "speaking"}
                onClick={session.checkAudio}
              >
                <Volume2 className="size-4" aria-hidden="true" />
                Check audio
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={snapshot.active ? "secondary" : "primary"}
              disabled={!available}
              onClick={() => (snapshot.active ? session.stop() : session.start())}
            >
              {snapshot.active ? (
                <Square className="size-4" aria-hidden="true" />
              ) : (
                <Mic className="size-4" aria-hidden="true" />
              )}
              {snapshot.active ? "End hands-free" : "Start listening"}
            </Button>
            {snapshot.active ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {snapshot.phase === "speaking" ? (
                  <Volume2 className="size-3" aria-hidden="true" />
                ) : null}
                {snapshot.phase === "listening" ? "Microphone on" : "Microphone paused"}
              </span>
            ) : null}
          </div>
          <p className="break-words text-xs text-muted-foreground" role="status">
            {!available
              ? "This browser does not support hands-free speech here. You can type or use your keyboard’s dictation."
              : snapshot.message ||
                "Starts only when you choose. Ends after five minutes; pauses when you leave this page."}
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer py-1 wl-focus-ring-halo">
              Bluetooth & commands
            </summary>
            <p className="mt-2">
              Pair earbuds, a headset, or glasses in your phone’s Bluetooth settings. Check the
              microphone and audio output there. This page cannot choose or verify a Bluetooth
              device.
            </p>
            <p className="mt-2">
              English dictation fills the current draft. Say <strong>{props.sendPhrase}</strong> to
              submit, <strong>save note</strong> to remember it privately, or{" "}
              <strong>stop listening</strong> to end this session. Actions keep their usual approval
              steps. Saved notes have up to 500 characters each.
            </p>
            <p className="mt-2">
              Say <strong>read draft</strong> or <strong>clear draft</strong> to review or clear the
              current draft.
            </p>
          </details>
        </div>
      ) : null}
    </div>
  );
}
