import type { ReactNode } from "react";
import { AlertCircle, Loader2, Mic, Phone, PhoneOff, Volume2 } from "lucide-react";

import { useProtectedPublicDemo } from "../../hooks/useProtectedPublicDemo";
import { cn } from "../../lib/utils";
import AgentFace from "../AgentFace";
import { SignalOrbFrame } from "../ui/SignalOrbFrame";
import { ShadButton } from "../ui/shadcn/ShadButton";

type BrowserCallWidgetProps = {
  agentName: string;
  /** Retained for call-site compatibility. Public demos use semantic tokens. */
  tintColor?: string;
  buttonLabel?: string;
  /** compact: supporting public pages. stage: the flagship homepage proof console. */
  variant?: "compact" | "stage";
  /** Optional non-runtime path displayed after a protected preview cannot start. */
  fallback?: ReactNode;
};

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
  const demo = useProtectedPublicDemo(
    agentName,
    variant === "stage" ? "landing_product_theater" : "showcase_browser_demo",
  );
  const showPhoneFallback = Boolean(fallback) && (Boolean(demo.error) || demo.completed);
  const buttonText = demo.connecting
    ? "Connecting…"
    : demo.callActive
      ? "End Call"
      : demo.completed
        ? "Demo Complete"
        : buttonLabel;

  if (variant === "stage") {
    const presence = demo.callActive
      ? "Live"
      : demo.connecting
        ? "Connecting"
        : showPhoneFallback
          ? "Phone Option"
          : "Ready";

    return (
      <div className={cn("landing-demo", demo.callActive && "is-live")}>
        <div className="landing-demo__portrait">
          <div className="landing-demo__presence">
            <span aria-hidden="true" />
            {presence}
          </div>
          <div className="landing-demo__face-frame">
            <AgentFace
              seed={`public-demo:${agentName}`}
              size={208}
              speaking={demo.callActive && demo.speakerActive}
              className="landing-demo__face"
              title={`${agentName} agent avatar`}
            />
          </div>
          <p className="landing-demo__name wl-preserve-case">{agentName}</p>
          <p className="landing-demo__role">Demo Voice Agent</p>
        </div>

        <div className="landing-demo__controls">
          <div className="landing-demo__signal" role="status" aria-live="polite">
            {demo.callActive ? (
              <>
                <Volume2
                  className={cn("size-3.5", demo.speakerActive && "text-primary")}
                  aria-hidden="true"
                />
                <WaveBars volume={demo.volume} active={demo.speakerActive} />
                <span>{demo.speakerActive ? "Agent speaking" : "Listening"}</span>
              </>
            ) : demo.connecting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                <span>Securing private preview</span>
              </>
            ) : showPhoneFallback ? (
              <>
                <Phone className="size-3.5" aria-hidden="true" />
                <span>Public demo line available</span>
              </>
            ) : (
              <>
                <Mic className="size-3.5" aria-hidden="true" />
                <span>Protected browser preview</span>
              </>
            )}
          </div>

          <button
            type="button"
            className={cn("landing-demo__button", demo.callActive && "is-end")}
            onClick={demo.toggle}
            disabled={demo.connecting || demo.completed}
            aria-busy={demo.connecting}
            aria-label={buttonText}
          >
            {demo.connecting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : demo.callActive ? (
              <PhoneOff className="size-4" aria-hidden="true" />
            ) : demo.completed ? (
              <Volume2 className="size-4" aria-hidden="true" />
            ) : (
              <Mic className="size-4" aria-hidden="true" />
            )}
            <span>{buttonText}</span>
          </button>

          <p className="landing-demo__microcopy">
            {demo.callActive
              ? `This preview ends automatically after ${demo.maxDurationSeconds} seconds. End it sooner at any time.`
              : showPhoneFallback
                ? "Call the public demo line below. Standard carrier rates may apply."
                : `No account required. Microphone access starts only when you choose the ${demo.maxDurationSeconds}-second preview.`}
          </p>

          {demo.error ? (
            <div className="grid justify-items-center gap-2">
              <p className="landing-demo__alert wl-preserve-case" role="alert">
                <AlertCircle className="size-3.5" aria-hidden="true" />
                <span>{demo.error}</span>
              </p>
              {fallback}
            </div>
          ) : demo.completed && fallback ? (
            <div className="grid justify-items-center gap-2">{fallback}</div>
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
          demo.callActive && "scale-105",
        )}
      >
        <div className="rounded-[18px] border border-border/80 bg-background p-1.5 shadow-sm">
          <AgentFace
            seed={`public-demo:${agentName}`}
            size={48}
            speaking={demo.callActive && demo.speakerActive}
            title={`${agentName} agent avatar`}
          />
        </div>
      </SignalOrbFrame>

      <ShadButton
        type="button"
        disableAnimations
        variant={demo.callActive ? "destructive" : "outline"}
        onClick={demo.toggle}
        disabled={demo.connecting || demo.completed}
        aria-busy={demo.connecting}
        aria-label={buttonText}
        className={cn(
          "relative z-10 h-12 select-none rounded-md border px-6 font-mono text-[length:var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[0.12em] transition-transform duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-border disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none",
          demo.callActive
            ? "border-[color:var(--wireline-color-status-error)] bg-[color:var(--wireline-color-status-error)] text-[color:var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm)]"
            : "border-[color:var(--wireline-color-action-primary-default)] bg-[color:var(--wireline-color-action-primary-default)] text-[color:var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm)] hover:border-[color:var(--wireline-color-action-primary-pressed)] hover:bg-[color:var(--wireline-color-action-primary-pressed)] hover:text-[color:var(--wireline-color-text-onAction)]",
        )}
      >
        {demo.connecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Connecting…</span>
          </>
        ) : demo.callActive ? (
          <>
            <PhoneOff className="h-4 w-4" aria-hidden="true" />
            <span>End Call</span>
          </>
        ) : demo.completed ? (
          <>
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            <span>Demo Complete</span>
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" aria-hidden="true" />
            <span>{buttonLabel}</span>
          </>
        )}
      </ShadButton>

      <p className="wl-preserve-case max-w-xs text-center text-xs leading-5 text-muted-foreground">
        {demo.maxDurationSeconds}-second private preview. No retained call artifacts.
      </p>

      {demo.callActive ? (
        <div
          className="flex h-7 items-center gap-2 rounded-full border border-border bg-[color:var(--wireline-color-surface-subtle)] px-4 py-1.5"
          role="status"
          aria-live="polite"
        >
          <Volume2
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground",
              demo.speakerActive && "animate-pulse text-primary",
            )}
            aria-hidden="true"
          />
          <WaveBars volume={demo.volume} active={demo.speakerActive} />
          <span className="font-mono text-[length:var(--wireline-typography-overline-size)] uppercase tracking-wider text-muted-foreground">
            {demo.speakerActive ? "Agent speaking" : "Listening"}
          </span>
        </div>
      ) : null}

      {demo.error ? (
        <div className="grid justify-items-center gap-2">
          <div
            className="wl-preserve-case flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm leading-5 text-muted-foreground"
            role="alert"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{demo.error}</span>
          </div>
          {fallback}
          {fallback ? (
            <p className="wl-preserve-case text-center text-xs text-muted-foreground">
              Standard carrier rates may apply.
            </p>
          ) : null}
        </div>
      ) : demo.completed && fallback ? (
        <div className="grid justify-items-center gap-2">
          {fallback}
          <p className="wl-preserve-case text-center text-xs text-muted-foreground">
            Standard carrier rates may apply.
          </p>
        </div>
      ) : null}
    </div>
  );
}
