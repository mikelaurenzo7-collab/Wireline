import { useEffect, useRef, useState, type ReactNode } from "react";
import type Vapi from "@vapi-ai/web";
import { AlertCircle, Loader2, Mic, Phone, PhoneOff, Volume2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { PUBLIC_BROWSER_DEMO_MAX_SECONDS } from "../../lib/public-browser-demo";
import AgentFace from "../AgentFace";
import { SignalOrbFrame } from "../ui/SignalOrbFrame";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { emitProductEvent } from "../../lib/product-event-client";

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY || "";

type BrowserCallWidgetProps = {
  agentName: string;
  /** Retained for call-site compatibility. The public demo uses shared semantic tokens. */
  tintColor?: string;
  buttonLabel?: string;
  /** compact: supporting public pages. stage: the flagship homepage proof console. */
  variant?: "compact" | "stage";
  /**
   * Rendered instead of a dead-end error when the browser voice demo cannot run.
   * The homepage keeps the proof console visible and swaps only the call control.
   */
  fallback?: ReactNode;
};

type AnalyticsWindow = Window & {
  fbq?: (event: string, action: string, data?: Record<string, unknown>) => void;
  plausible?: (event: string, data?: Record<string, unknown>) => void;
};

function callStartErrorMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "NotAllowedError") {
    return "Microphone access is required to start the voice demo.";
  }
  if (reason instanceof DOMException && reason.name === "NotFoundError") {
    return "No microphone was found on this device.";
  }
  return "Could not start the voice demo. Try again.";
}

function WaveBars({
  volume,
  active,
  bars = 5,
}: {
  volume: number;
  active: boolean;
  bars?: number;
}) {
  return (
    <div className="flex h-3 items-end gap-0.5" aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => {
        const bar = index + 1;
        const scaled = volume * (1 + bar * 0.3);
        const height = scaled > 0.01 ? Math.min(100, Math.max(15, scaled * 100)) : 15;
        return (
          <div
            key={bar}
            className="w-0.5 rounded-full bg-primary transition-all duration-75"
            style={{ height: `${height}%`, opacity: active ? 1 : 0.35 }}
          />
        );
      })}
    </div>
  );
}

export default function BrowserCallWidget({
  agentName,
  tintColor: _tintColor,
  buttonLabel = "Talk in browser",
  variant = "compact",
  fallback,
}: BrowserCallWidgetProps) {
  const [callActive, setCallActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speakerActive, setSpeakerActive] = useState(false);

  // The ~300 KB @vapi-ai/web WebRTC SDK is only needed once the visitor starts a
  // call, so it is imported dynamically on first use rather than shipped in the
  // marketing page bundle. Keep the instance in a ref so it survives re-renders.
  const vapiRef = useRef<Vapi | null>(null);
  const callStopTimerRef = useRef<number | null>(null);
  const agentNameRef = useRef(agentName);
  agentNameRef.current = agentName;

  const clearCallStopTimer = () => {
    if (callStopTimerRef.current === null) return;
    window.clearTimeout(callStopTimerRef.current);
    callStopTimerRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (callStopTimerRef.current !== null) {
        window.clearTimeout(callStopTimerRef.current);
        callStopTimerRef.current = null;
      }
      try {
        vapiRef.current?.stop();
      } catch {
        // Nothing to clean up when a session never started.
      }
    };
  }, []);

  async function ensureVapi(): Promise<Vapi | null> {
    if (vapiRef.current) return vapiRef.current;
    if (!VAPI_PUBLIC_KEY) {
      setError("Voice demo is unavailable right now.");
      return null;
    }
    const { default: VapiSDK } = await import("@vapi-ai/web");
    const instance = new VapiSDK(VAPI_PUBLIC_KEY);

    instance.on("call-start", () => {
      clearCallStopTimer();
      callStopTimerRef.current = window.setTimeout(() => {
        callStopTimerRef.current = null;
        try {
          instance.stop();
        } catch {
          // The provider may already have ended at the same hard ceiling.
        }
      }, PUBLIC_BROWSER_DEMO_MAX_SECONDS * 1000);
      setConnecting(false);
      setCallActive(true);
      setError(null);
      if (typeof window !== "undefined") {
        const analytics = window as AnalyticsWindow;
        analytics.fbq?.("trackCustom", "BrowserCallStart", { agent: agentNameRef.current });
        analytics.plausible?.("BrowserCallStart", { props: { agent: agentNameRef.current } });
      }
    });

    instance.on("call-end", () => {
      clearCallStopTimer();
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
      clearCallStopTimer();
      console.error("[wireline:webrtc] voice bridge error:", reason);
      setError("Voice connection failed. Try again.");
      setConnecting(false);
      setCallActive(false);
      setVolume(0);
      setSpeakerActive(false);
    });

    vapiRef.current = instance;
    return instance;
  }

  const handleToggleCall = async () => {
    if (callActive) {
      clearCallStopTimer();
      setConnecting(true);
      vapiRef.current?.stop();
      return;
    }

    try {
      setConnecting(true);
      setError(null);
      emitProductEvent({
        event: "landing_demo_clicked",
        surface: "marketing_web",
        metadata: { agent: agentName, mode: "browser_voice" },
      });
      const instance = await ensureVapi();
      if (!instance) {
        setConnecting(false);
        return;
      }
      const response = await fetch(`/api/public/assistant/${encodeURIComponent(agentName)}`);
      if (!response.ok) throw new Error("Could not load the demo agent.");
      const assistantPayload = await response.json();

      if (navigator.mediaDevices?.getUserMedia) {
        const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of permissionStream.getTracks()) track.stop();
      }
      await instance.start(assistantPayload);
    } catch (reason: unknown) {
      clearCallStopTimer();
      console.error("[wireline:webrtc] Call start failed:", reason);
      setError(callStartErrorMessage(reason));
      setConnecting(false);
    }
  };

  const buttonText = connecting ? "Connecting…" : callActive ? "End Call" : buttonLabel;
  const useFallbackControl = !VAPI_PUBLIC_KEY && Boolean(fallback);
  const idleDemoCopy = useFallbackControl
    ? "Call the public demo line. Standard carrier rates may apply."
    : `No account required. Microphone access starts only when you choose the ${PUBLIC_BROWSER_DEMO_MAX_SECONDS}-second preview.`;

  if (useFallbackControl && variant !== "stage") {
    return <>{fallback}</>;
  }

  if (variant === "stage") {
    return (
      <div className={cn("landing-demo", callActive && "is-live")}>
        <div className="landing-demo__portrait">
          <div className="landing-demo__presence">
            <span aria-hidden="true" />
            {callActive ? "Live" : "Ready"}
          </div>
          <div className="landing-demo__face-frame">
            <AgentFace
              seed={`public-demo:${agentName}`}
              size={208}
              speaking={callActive && speakerActive}
              className="landing-demo__face"
              title={`${agentName} agent avatar`}
            />
          </div>
          <p className="landing-demo__name wl-preserve-case">{agentName}</p>
          <p className="landing-demo__role">Demo Voice Agent</p>
        </div>

        <div className="landing-demo__controls">
          <div className="landing-demo__signal" role="status" aria-live="polite">
            {callActive ? (
              <>
                <Volume2
                  className={cn("size-3.5", speakerActive && "text-primary")}
                  aria-hidden="true"
                />
                <WaveBars volume={volume} active={speakerActive} />
                <span>{speakerActive ? "Agent speaking" : "Listening"}</span>
              </>
            ) : useFallbackControl ? (
              <>
                <Phone className="size-3.5" aria-hidden="true" />
                <span>Public Demo Line</span>
              </>
            ) : (
              <>
                <Mic className="size-3.5" aria-hidden="true" />
                <span>Browser Voice Preview</span>
              </>
            )}
          </div>

          {useFallbackControl ? (
            fallback
          ) : (
            <button
              type="button"
              className={cn("landing-demo__button", callActive && "is-end")}
              onClick={() => void handleToggleCall()}
              disabled={connecting}
              aria-busy={connecting}
              aria-label={buttonText}
            >
              {connecting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : callActive ? (
                <PhoneOff className="size-4" aria-hidden="true" />
              ) : (
                <Phone className="size-4" aria-hidden="true" />
              )}
              <span>{buttonText}</span>
            </button>
          )}

          <p className="landing-demo__microcopy">
            {callActive
              ? `This preview ends automatically after ${PUBLIC_BROWSER_DEMO_MAX_SECONDS} seconds. End it sooner at any time.`
              : idleDemoCopy}
          </p>

          {error ? (
            <p className="landing-demo__alert" role="alert">
              <AlertCircle className="size-3.5" aria-hidden="true" />
              <span>{error}</span>
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <SignalOrbFrame
        size="sm"
        withConstellation
        withBloom
        refined={false}
        className={cn(
          "transition-transform duration-200 motion-reduce:transition-none",
          callActive && "scale-105",
        )}
      >
        <div className="rounded-[18px] border border-border/80 bg-background p-1.5 shadow-sm">
          <AgentFace
            seed={`public-demo:${agentName}`}
            size={48}
            speaking={callActive && speakerActive}
            title={`${agentName} agent avatar`}
          />
        </div>
      </SignalOrbFrame>
      <ShadButton
        type="button"
        disableAnimations
        variant={callActive ? "destructive" : "outline"}
        onClick={handleToggleCall}
        disabled={connecting}
        aria-busy={connecting}
        aria-label={buttonText}
        className={cn(
          "relative z-10 h-12 select-none rounded-md border px-6 font-mono text-[length:var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[0.12em] transition-transform duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-border disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none",
          callActive
            ? "border-[color:var(--wireline-color-status-error)] bg-[color:var(--wireline-color-status-error)] text-[color:var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm)]"
            : "border-[color:var(--wireline-color-action-primary-default)] bg-[color:var(--wireline-color-action-primary-default)] text-[color:var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm)] hover:border-[color:var(--wireline-color-action-primary-pressed)] hover:bg-[color:var(--wireline-color-action-primary-pressed)] hover:text-[color:var(--wireline-color-text-onAction)]",
        )}
      >
        {connecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Connecting…</span>
          </>
        ) : callActive ? (
          <>
            <PhoneOff className="h-4 w-4" aria-hidden="true" />
            <span>End Call</span>
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" aria-hidden="true" />
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
        <div
          className="flex h-7 items-center gap-2 rounded-full border border-border bg-[color:var(--wireline-color-surface-subtle)] px-4 py-1.5"
          role="status"
          aria-live="polite"
        >
          <Volume2
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground",
              speakerActive && "animate-pulse text-primary",
            )}
            aria-hidden="true"
          />
          <WaveBars volume={volume} active={speakerActive} />
          <span className="font-mono text-[length:var(--wireline-typography-overline-size)] uppercase tracking-wider text-muted-foreground">
            {speakerActive ? "Agent speaking" : "Listening"}
          </span>
        </div>
      )}

      {error && (
        <div
          className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1 text-[length:var(--wireline-typography-overline-size)] font-medium uppercase tracking-wider text-muted-foreground"
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
