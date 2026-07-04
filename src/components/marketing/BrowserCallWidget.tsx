import { useEffect, useState } from "react";
import Vapi from "@vapi-ai/web";
import { PhoneOff, Mic, Loader2, AlertCircle, Volume2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import AgentFace from "../AgentFace";

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY || "";

type BrowserCallWidgetProps = {
  agentName: string;
  /** Retained for call-site compatibility. The public demo uses shared semantic tokens. */
  tintColor?: string;
  buttonLabel?: string;
};

type AnalyticsWindow = Window & {
  fbq?: (event: string, action: string, data?: Record<string, unknown>) => void;
  plausible?: (event: string, data?: Record<string, unknown>) => void;
};

export default function BrowserCallWidget({
  agentName,
  tintColor: _tintColor,
  buttonLabel = "Talk in browser",
}: BrowserCallWidgetProps) {
  const [vapi, setVapi] = useState<Vapi | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speakerActive, setSpeakerActive] = useState(false);

  useEffect(() => {
    if (!VAPI_PUBLIC_KEY) {
      setError("Voice demo is unavailable right now.");
      return;
    }

    const instance = new Vapi(VAPI_PUBLIC_KEY);
    setVapi(instance);

    instance.on("call-start", () => {
      setConnecting(false);
      setCallActive(true);
      setError(null);
      if (typeof window !== "undefined") {
        const analytics = window as AnalyticsWindow;
        analytics.fbq?.("trackCustom", "BrowserCallStart", { agent: agentName });
        analytics.plausible?.("BrowserCallStart", { props: { agent: agentName } });
      }
    });

    instance.on("call-end", () => {
      setCallActive(false);
      setConnecting(false);
      setVolume(0);
      setSpeakerActive(false);
    });

    instance.on("volume-level", (nextVolume: number) => {
      setVolume(nextVolume);
      setSpeakerActive(nextVolume > 0.02);
    });

    instance.on("error", (reason: unknown) => {
      console.error("[wireline:webrtc] voice bridge error:", reason);
      setError(reason instanceof Error ? reason.message : "Voice connection failed.");
      setConnecting(false);
      setCallActive(false);
      setVolume(0);
      setSpeakerActive(false);
    });

    return () => {
      try {
        instance.stop();
      } catch {
        // Nothing to clean up when a session never started.
      }
    };
  }, [agentName]);

  const handleToggleCall = async () => {
    if (!vapi) return;

    if (callActive) {
      setConnecting(true);
      vapi.stop();
      return;
    }

    try {
      setConnecting(true);
      setError(null);
      const response = await fetch(`/api/public/assistant/${agentName}`);
      if (!response.ok) throw new Error("Could not load the demo agent.");
      const assistantPayload = await response.json();

      if (navigator.mediaDevices?.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      vapi.start(assistantPayload);
    } catch (reason: unknown) {
      console.error("[wireline:webrtc] Call start failed:", reason);
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not access your microphone or start the demo.",
      );
      setConnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <AgentFace
        seed={agentName}
        size={callActive ? 56 : 44}
        speaking={callActive && speakerActive}
        title={`${agentName} face`}
        className="transition-[width,height] duration-200"
      />
      <ShadButton
        type="button"
        disableAnimations
        variant={callActive ? "destructive" : "outline"}
        onClick={handleToggleCall}
        disabled={connecting || !vapi}
        aria-label={callActive ? "End conversation" : "Talk to agent"}
        className={cn(
          "relative z-10 h-12 select-none rounded-md border px-6 font-mono text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[0.12em] transition-transform duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-border disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none",
          callActive
            ? "border-[color:var(--wireline-status-error)] bg-[color:var(--wireline-status-error)] text-white shadow-[var(--wireline-elevation-sm)]"
            : "border-[color:var(--wireline-color-action-primary-default)] bg-[color:var(--wireline-color-action-primary-default)] text-white shadow-[var(--wireline-elevation-sm)] hover:border-[color:var(--wireline-color-action-primary-pressed)] hover:bg-[color:var(--wireline-color-action-primary-pressed)] hover:text-white",
        )}
      >
        {connecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Connecting...</span>
          </>
        ) : callActive ? (
          <>
            <PhoneOff className="h-4 w-4" />
            <span>End call</span>
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" />
            <span>{buttonLabel}</span>
          </>
        )}
        {callActive && (
          <span
            className="pointer-events-none absolute inset-0 -z-10 animate-ping rounded-md bg-primary opacity-15"
            aria-hidden="true"
          />
        )}
      </ShadButton>

      {callActive && (
        <div className="flex h-7 items-center gap-2 rounded-full border border-border bg-[color:var(--wireline-surface-subtle)] px-4 py-1.5">
          <Volume2
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground",
              speakerActive && "animate-pulse text-primary",
            )}
          />
          <div className="flex h-3 items-end gap-0.5">
            {[1, 2, 3, 4, 5].map((bar) => {
              const scaled = volume * (1 + bar * 0.3);
              const height = scaled > 0.01 ? Math.min(100, Math.max(15, scaled * 100)) : 15;
              return (
                <div
                  key={bar}
                  className="w-0.5 rounded-full bg-primary transition-all duration-75"
                  style={{ height: `${height}%`, opacity: speakerActive ? 1 : 0.35 }}
                />
              );
            })}
          </div>
          <span className="font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-wider text-muted-foreground">
            {speakerActive ? "Agent speaking" : "Listening"}
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1 text-[var(--wireline-typography-overline-size)] font-medium uppercase tracking-wider text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
