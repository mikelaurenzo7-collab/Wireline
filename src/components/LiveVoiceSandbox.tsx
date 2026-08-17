import { useEffect, useState } from "react";

import { authFetch } from "../lib/api";
import OpenAILiveVoiceSandbox from "./OpenAILiveVoiceSandbox";
import VapiLiveVoiceSandbox from "./VapiLiveVoiceSandbox";

type StudioLiveMode = "pending" | "vapi" | "openai";

/**
 * Studio live tests default to the same Vapi xAI assistant as live phone calls.
 * OpenAI Realtime is automatic backup only — there is no user-facing provider
 * picker, because a separate test brain would not match what ships.
 */
export default function LiveVoiceSandbox({
  agentId,
  agentName,
  onAgentAudioDelta,
  onAgentAudioEnd,
  onTestStarted,
  onTestCompleted,
}: {
  agentId: string;
  agentName: string;
  onAgentAudioDelta?: (base64Pcm: string) => void;
  onAgentAudioEnd?: () => void;
  onTestStarted?: () => void;
  onTestCompleted?: () => void;
}) {
  const [mode, setMode] = useState<StudioLiveMode>("pending");

  useEffect(() => {
    let cancelled = false;
    void authFetch("/api/voice/live/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { defaultProvider?: string } | null) => {
        if (cancelled) return;
        setMode(body?.defaultProvider === "vapi" ? "vapi" : "openai");
      })
      .catch(() => {
        if (!cancelled) setMode("openai");
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (mode === "pending") {
    return (
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="text-[length:var(--wireline-typography-caption-size)] text-muted-foreground">
          Preparing a private live test…
        </p>
      </section>
    );
  }

  if (mode === "vapi") {
    return (
      <VapiLiveVoiceSandbox
        agentId={agentId}
        agentName={agentName}
        onTestStarted={onTestStarted}
        onTestCompleted={onTestCompleted}
        onUnavailable={() => setMode("openai")}
      />
    );
  }

  return (
    <OpenAILiveVoiceSandbox
      agentId={agentId}
      agentName={agentName}
      onAgentAudioDelta={onAgentAudioDelta}
      onAgentAudioEnd={onAgentAudioEnd}
      onTestStarted={onTestStarted}
      onTestCompleted={onTestCompleted}
    />
  );
}
