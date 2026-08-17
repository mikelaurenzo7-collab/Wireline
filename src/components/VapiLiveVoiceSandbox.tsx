import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Mic, PhoneOff, RotateCcw } from "lucide-react";
import type Vapi from "@vapi-ai/web";

import AgentFace from "./AgentFace";
import { authFetch } from "../lib/api";
import { ConversationActivity, ConversationMessage, StatusNotice } from "./molecules";

type Line = { id: string; role: "You" | "Agent"; text: string };
type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "thinking" | "error";

type WebSessionResponse = {
  token: string;
  proxyUrl: string;
  maxDurationSeconds?: number;
};

const CONNECTION_TIMEOUT_MS = 20_000;
const STUDIO_VAPI_WEB_ASSISTANT_SENTINEL = "wireline-studio-live-test";

function voiceActivity(state: VoiceState) {
  if (state === "error")
    return {
      state: "failed" as const,
      title: "Live voice needs attention",
      detail: "The test stopped before the conversation could continue.",
    };
  if (state === "connecting")
    return {
      state: "pending" as const,
      title: "Connecting live voice",
      detail: "Starting a private browser test with the same intelligence and voice as live calls.",
    };
  if (state === "thinking")
    return {
      state: "active" as const,
      title: "Checking approved knowledge",
      detail: "Wireline is using only the approved Training context.",
    };
  if (state === "speaking")
    return {
      state: "active" as const,
      title: "Agent speaking",
      detail: "You can interrupt naturally at any time.",
    };
  if (state === "listening")
    return {
      state: "complete" as const,
      title: "Listening",
      detail: "This private live test uses the same live-call intelligence and voice.",
    };
  return {
    state: "pending" as const,
    title: "Ready for a private live test",
    detail: "Start a test to speak with this profile using its live-call intelligence and voice.",
  };
}

export default function VapiLiveVoiceSandbox({
  agentId,
  agentName,
  onTestStarted,
  onTestCompleted,
  onUnavailable,
}: {
  agentId: string;
  agentName: string;
  onTestStarted?: () => void;
  onTestCompleted?: () => void;
  onUnavailable?: () => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const vapiRef = useRef<Vapi | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const generation = useRef(0);
  const reportedStarted = useRef(false);
  const reportedCompleted = useRef(false);
  const assistantLineId = useRef<string | null>(null);
  const userLineId = useRef<string | null>(null);

  const activity = voiceActivity(state);
  const active = ["connecting", "listening", "speaking", "thinking"].includes(state);

  const upsertLine = (id: string, role: Line["role"], text: string, replace = false) => {
    if (!text) return;
    setLines((current) => {
      const index = current.findIndex((line) => line.id === id);
      if (index < 0) return [...current, { id, role, text }].slice(-16);
      const next = [...current];
      next[index] = { ...next[index], text: replace ? text : `${next[index].text}${text}` };
      return next;
    });
  };

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const release = useCallback(() => {
    clearWatchdog();
    try {
      vapiRef.current?.stop();
    } catch {
      // A session that never connected has nothing to stop.
    }
    vapiRef.current = null;
    assistantLineId.current = null;
    userLineId.current = null;
  }, [clearWatchdog]);

  const stop = useCallback(() => {
    generation.current += 1;
    release();
    setState("idle");
  }, [release]);

  const fail = useCallback(
    (message: string, unavailable = false) => {
      generation.current += 1;
      release();
      if (unavailable && onUnavailable) {
        onUnavailable();
        return;
      }
      setError(message);
      setState("error");
    },
    [onUnavailable, release],
  );

  useEffect(() => {
    return () => {
      generation.current += 1;
      release();
    };
  }, [release]);

  const handleMessage = (message: { type?: string; transcriptType?: string; role?: string; transcript?: string }) => {
    if (message.type === "speech-update") {
      setState(message.role === "assistant" ? "speaking" : "listening");
      return;
    }
    if (message.type !== "transcript") return;
    const text = typeof message.transcript === "string" ? message.transcript.trim() : "";
    if (!text) return;
    const final = message.transcriptType !== "partial";
    if (message.role === "user") {
      const id = userLineId.current || `user-${Date.now()}`;
      userLineId.current = id;
      upsertLine(id, "You", text, true);
      if (final) userLineId.current = null;
      return;
    }
    const id = assistantLineId.current || `assistant-${Date.now()}`;
    assistantLineId.current = id;
    upsertLine(id, "Agent", text, true);
    if (final) assistantLineId.current = null;
  };

  const start = async () => {
    if (active) return;
    stop();
    const currentGeneration = generation.current;
    reportedStarted.current = false;
    reportedCompleted.current = false;
    setError("");
    setLines([]);
    setState("connecting");

    try {
      const response = await authFetch("/api/voice/live/web-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      const body = (await response.json().catch(() => null)) as
        | (WebSessionResponse & { error?: string })
        | null;
      if (currentGeneration !== generation.current) return;
      if (response.status === 503) {
        fail("The live phone test is temporarily unavailable.", true);
        return;
      }
      if (!response.ok || !body?.token || !body.proxyUrl) {
        fail(typeof body?.error === "string" ? body.error : "The live phone test could not start.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        fail("This browser does not support microphone-based live tests.");
        return;
      }
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of permissionStream.getTracks()) track.stop();
      if (currentGeneration !== generation.current) return;

      const { default: VapiSDK } = await import("@vapi-ai/web");
      const absoluteProxyUrl = new URL(body.proxyUrl, window.location.origin)
        .toString()
        .replace(/\/$/, "");
      const instance = new VapiSDK(body.token, absoluteProxyUrl);

      instance.on("call-start", () => {
        if (currentGeneration !== generation.current) return;
        reportedStarted.current = true;
        onTestStarted?.();
        setState("listening");
      });
      instance.on("speech-start", () => {
        if (currentGeneration !== generation.current) return;
        setState("speaking");
      });
      instance.on("speech-end", () => {
        if (currentGeneration !== generation.current) return;
        setState("listening");
      });
      instance.on("message", (message) => {
        if (currentGeneration !== generation.current) return;
        handleMessage(message as { type?: string; transcriptType?: string; role?: string; transcript?: string });
      });
      instance.on("call-end", () => {
        if (currentGeneration !== generation.current) return;
        if (reportedStarted.current && !reportedCompleted.current) {
          reportedCompleted.current = true;
          onTestCompleted?.();
        }
        release();
        setState("idle");
      });
      instance.on("error", () => {
        if (currentGeneration !== generation.current) return;
        fail("The live connection ended. Try the test again.");
      });

      vapiRef.current = instance;
      clearWatchdog();
      watchdogRef.current = window.setTimeout(() => {
        if (currentGeneration !== generation.current || reportedStarted.current) return;
        fail("The live connection took too long. Try the test again.");
      }, CONNECTION_TIMEOUT_MS);

      await instance.start(STUDIO_VAPI_WEB_ASSISTANT_SENTINEL);
    } catch {
      if (currentGeneration !== generation.current) return;
      fail("The live phone test could not start.", true);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="wl-presence__frame wl-presence--inline shrink-0">
            <div className="wl-presence__face">
              <AgentFace
                seed={agentName}
                size={44}
                speaking={state === "speaking"}
                title={`${agentName} face`}
              />
            </div>
          </div>
          <div className="min-w-0">
            <p className="wl-stitch-label">Live voice</p>
            <h3 className="mt-1 font-display text-[length:var(--wireline-typography-h3-size)] font-semibold tracking-[-.02em] text-foreground">
              Speak with <span className="wl-preserve-case">{agentName}</span>
            </h3>
            <p className="mt-1 max-w-2xl text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
              A private browser test using the same live-call intelligence and voice as a real
              phone call.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={active ? stop : () => void start()}
          className={active ? "studio-secondary-button" : "studio-primary-button"}
        >
          {state === "connecting" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : active ? (
            <PhoneOff size={16} />
          ) : (
            <Mic size={16} />
          )}
          {active ? "End live test" : "Start live test"}
        </button>
      </div>

      <ConversationActivity
        className="mt-4"
        state={activity.state}
        title={activity.title}
        detail={activity.detail}
        icon={<AudioLines aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />}
      />

      <div
        className="mt-4 min-h-[130px] space-y-3 rounded-lg border border-border bg-secondary p-4"
        aria-live="polite"
        aria-label="Live voice transcript"
      >
        {lines.length ? (
          lines.map((line) => (
            <ConversationMessage
              key={line.id}
              author={line.role === "You" ? "customer" : "assistant"}
              channel="voice"
              label={line.role === "You" ? "You" : agentName}
            >
              {line.text}
            </ConversationMessage>
          ))
        ) : (
          <div className="grid min-h-[96px] place-items-center text-center">
            <p className="max-w-md text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
              Start a test, ask a real question, and interrupt naturally. This safe channel can
              search approved Training facts but cannot perform external actions.
            </p>
          </div>
        )}
      </div>

      {error ? (
        <StatusNotice
          tone="destructive"
          className="mt-3"
          title="Live voice interrupted"
          action={
            <button
              type="button"
              onClick={() => {
                setError("");
                setState("idle");
              }}
              aria-label="Reset live voice"
              className="grid h-11 w-11 place-items-center rounded-md hover:bg-secondary"
            >
              <RotateCcw size={14} />
            </button>
          }
        >
          {error}
        </StatusNotice>
      ) : null}
    </section>
  );
}
