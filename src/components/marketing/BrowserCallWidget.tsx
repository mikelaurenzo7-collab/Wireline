import { useEffect, useState } from "react";
import Vapi from "@vapi-ai/web";
import { AlertCircle, Loader2, Mic, PhoneOff, Volume2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY || "";

type BrowserCallWidgetProps = {
  agentName: string;
  buttonLabel?: string;
};

type AnalyticsWindow = Window & {
  fbq?: (event: string, action: string, data?: Record<string, unknown>) => void;
  plausible?: (event: string, data?: Record<string, unknown>) => void;
};

/**
 * Public voice preview. The visual treatment intentionally uses the same warm
 * monochrome foundation as the landing page; agent identity never changes the
 * consumer-facing palette.
 */
export default function BrowserCallWidget({
  agentName,
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
      setError("Voice preview is not configured yet.");
      return;
    }

    const instance = new Vapi(VAPI_PUBLIC_KEY);
    setVapi(instance);

    instance.on("call-start", () => {
      setConnecting(false);
      setCallActive(true);
      setError(null);
      if (typeof window === "undefined") return;
      const analytics = window as AnalyticsWindow;
      analytics.fbq?.("trackCustom", "BrowserCallStart", { agent: agentName });
      analytics.plausible?.("BrowserCallStart", { props: { agent: agentName } });
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

    instance.on("error", (cause: unknown) => {
      console.error("[wireline:webrtc] Voice preview failed:", cause);
      setError(cause instanceof Error ? cause.message : "Voice preview could not connect.");
      setConnecting(false);
      setCallActive(false);
      setVolume(0);
      setSpeakerActive(false);
    });

    return () => {
      try {
        instance.stop();
      } catch {
        // The SDK can already be closed during unmount.
      }
    };
  }, [agentName]);

  async function handleToggleCall() {
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
      if (!response.ok) throw new Error("Voice preview is unavailable right now.");
      const assistantPayload = await response.json();
      if (navigator.mediaDevices?.getUserMedia) await navigator.mediaDevices.getUserMedia({ audio: true });
      vapi.start(assistantPayload);
    } catch (cause: unknown) {
      console.error("[wireline:webrtc] Voice preview start failed:", cause);
      setError(cause instanceof Error ? cause.message : "Could not access your microphone.");
      setConnecting(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <ShadButton
        type="button"
        disableAnimations
        variant={callActive ? "destructive" : "outline"}
        onClick={handleToggleCall}
        disabled={connecting || !vapi}
        aria-label={callActive ? "End conversation" : "Talk to agent"}
        className={cn(
          "relative h-12 rounded-full border px-6 font-sans text-[13px] font-semibold shadow-none transition-colors",
          callActive
            ? "border-[#b42318] bg-[#b42318] text-white hover:bg-[#8f1d15]"
            : "border-[#1d1d1f] bg-[#1d1d1f] text-white hover:bg-black",
        )}
      >
        {connecting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /><span>Connecting…</span></>
        ) : callActive ? (
          <><PhoneOff className="h-4 w-4" /><span>End call</span></>
        ) : (
          <><Mic className="h-4 w-4" /><span>{buttonLabel}</span></>
        )}
        {callActive && <span className="pointer-events-none absolute inset-0 -z-10 animate-ping rounded-full bg-[#1d1d1f]/15" />}
      </ShadButton>

      {callActive && (
        <div className="flex h-7 items-center gap-2 rounded-full border border-[#1d1d1f]/10 bg-[#f7f7f5] px-3 text-[#4f4f55]">
          <Volume2 className={cn("h-3.5 w-3.5", speakerActive && "text-[#1d1d1f]")} />
          <div className="flex h-3 items-end gap-0.5">
            {[1, 2, 3, 4, 5].map((bar) => {
              const scale = volume * (1 + bar * 0.3);
              const height = scale > 0.01 ? Math.min(100, Math.max(15, scale * 100)) : 15;
              return <span key={bar} className="w-0.5 rounded-full bg-[#1d1d1f] transition-all duration-75" style={{ height: `${height}%` }} />;
            })}
          </div>
          <span className="text-[10px] font-medium">{speakerActive ? "Assistant speaking" : "Listening"}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[#b42318]/20 bg-[#b42318]/5 px-3 py-2 text-xs font-medium text-[#8f1d15]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
