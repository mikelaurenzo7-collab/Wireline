import { useState, useEffect } from "react";
import Vapi from "@vapi-ai/web";
import { PhoneOff, Mic, Loader2, AlertCircle, Volume2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { BRAND } from "../../constants/brand-colors";
import { asStyle } from "@/src/lib/css-style";

// Retrieve Vapi public key safely from Vite environment
const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY || "";

interface BrowserCallWidgetProps {
  agentName: string;
  /** Optional tint override. Reserved for future per-agent theming; reads
   *  from the agent's `tint` field when wired through callers. */
  tintColor?: string;
  buttonLabel?: string;
}

type AnalyticsWindow = Window & {
  fbq?: (event: string, action: string, data?: Record<string, unknown>) => void;
  plausible?: (event: string, data?: Record<string, unknown>) => void;
};

export default function BrowserCallWidget({
  agentName,
  tintColor: _tintColor = "#8B3FD6",
  buttonLabel = "Talk in browser",
}: BrowserCallWidgetProps) {
  const [vapi, setVapi] = useState<Vapi | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speakerActive, setSpeakerActive] = useState(false);

  const activeColor = agentName === "Jake" ? BRAND.purpleDeep : BRAND.purple;

  // Initialize Vapi SDK on mount
  useEffect(() => {
    if (!VAPI_PUBLIC_KEY) {
      setError("Vapi public key is unset. Configure VITE_VAPI_PUBLIC_KEY in your env.");
      return;
    }
    const inst = new Vapi(VAPI_PUBLIC_KEY);
    setVapi(inst);

    // Event bindings
    inst.on("call-start", () => {
      setConnecting(false);
      setCallActive(true);
      setError(null);

      // Dispatch browser call start conversion event
      if (typeof window !== "undefined") {
        const w = window as AnalyticsWindow;
        if (typeof w.fbq === "function") {
          w.fbq("trackCustom", "BrowserCallStart", { agent: agentName });
        }
        if (typeof w.plausible === "function") {
          w.plausible("BrowserCallStart", { props: { agent: agentName } });
        }
      }
    });

    inst.on("call-end", () => {
      setCallActive(false);
      setConnecting(false);
      setVolume(0);
      setSpeakerActive(false);
    });

    inst.on("volume-level", (vol: number) => {
      setVolume(vol);
      setSpeakerActive(vol > 0.02);
    });

    inst.on("error", (err: unknown) => {
      console.error("[wireline:webrtc] Vapi error:", err);
      const message = err instanceof Error ? err.message : "Voice connection failed.";
      setError(message);
      setConnecting(false);
      setCallActive(false);
      setVolume(0);
      setSpeakerActive(false);
    });

    return () => {
      try {
        inst.stop();
      } catch {
        /* skip */
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

      // Fetch the dynamically-constructed showcase assistant payload from our backend public endpoint
      const response = await fetch(`/api/public/assistant/${agentName}`);
      if (!response.ok) {
        throw new Error(`Failed to load assistant profile: ${response.statusText}`);
      }
      const assistantPayload = await response.json();

      // Request microphone permissions proactively
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      // Start the voice session passing the full production-grade payload
      vapi.start(assistantPayload);
    } catch (err: unknown) {
      console.error("[wireline:webrtc] Call start failed:", err);
      const message = err instanceof Error ? err.message : "Could not access microphone or server.";
      setError(message);
      setConnecting(false);
    }
  };

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
          "relative h-12 px-6 rounded-full font-mono text-[11px] uppercase tracking-[0.2em] font-semibold z-10 select-none shadow-md",
          callActive
            ? "shadow-rose-500/20"
            : "bg-[#1A1614] text-[#EFE9DC] hover:text-white border-[#EFE9DC]/10 hover:border-[#EFE9DC]/30 hover:shadow-lg",
        )}
      >
        {connecting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Connecting...</span>
          </>
        ) : callActive ? (
          <>
            <PhoneOff className="w-4 h-4" />
            <span>End Call</span>
          </>
        ) : (
          <>
            <Mic className="w-4 h-4" style={asStyle({ color: activeColor })} />
            <span>{buttonLabel}</span>
          </>
        )}

        {/* Glow Ring behind button when active */}
        {callActive && (
          <span
            className="absolute inset-0 rounded-full animate-ping -z-10 opacity-20 pointer-events-none"
            style={asStyle({ backgroundColor: activeColor })}
          />
        )}
      </ShadButton>

      {/* Real-time speaking/volume animation bars */}
      {callActive && (
        <div className="flex items-center gap-1.5 h-6 px-4 py-1.5 rounded-full bg-white/5 border border-white/5 animate-fade-in">
          <Volume2
            className={cn("w-3 h-3 text-muted", speakerActive && "text-brand animate-pulse")}
          />
          <div className="flex items-end gap-0.5 h-3">
            {[1, 2, 3, 4, 5].map((bar) => {
              // volume scales height dynamically
              const volScale = volume * (1 + bar * 0.3);
              const height = volScale > 0.01 ? Math.min(100, Math.max(15, volScale * 100)) : 15;
              return (
                <div
                  key={bar}
                  className="w-0.5 rounded-full transition-all duration-75"
                  style={asStyle({
                    height: `${height}%`,
                    backgroundColor: activeColor,
                    opacity: speakerActive ? 0.9 : 0.4,
                  })}
                />
              );
            })}
          </div>
          <span className="text-[9px] font-mono tracking-wider text-muted uppercase">
            {speakerActive ? "Agent speaking" : "Listening"}
          </span>
        </div>
      )}

      {/* Soft Error Message Banner */}
      {error && (
        <div className="flex items-center gap-2 text-rose-500 font-mono text-[9px] uppercase tracking-wider bg-rose-500/5 px-3 py-1 rounded-md border border-rose-500/10">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
