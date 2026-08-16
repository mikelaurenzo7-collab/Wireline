import type { ReactNode } from "react";
import { AlertCircle, Loader2, Mic, PhoneOff, Volume2 } from "lucide-react";

import { cn } from "../../lib/utils";
import { useProtectedPublicDemo } from "../../hooks/useProtectedPublicDemo";
import AgentFace from "../AgentFace";
import { SignalOrbFrame } from "../ui/SignalOrbFrame";
import { ShadButton } from "../ui/shadcn/ShadButton";

type BrowserCallWidgetProps = {
  agentName: string;
  /** Retained for call-site compatibility. The public demo uses shared semantic tokens. */
  tintColor?: string;
  buttonLabel?: string;
  /** Optional non-runtime path shown only when the protected demo cannot start. */
  fallback?: ReactNode;
};

export default function BrowserCallWidget({
  agentName,
  tintColor: _tintColor,
  buttonLabel = "Talk in browser",
  fallback,
}: BrowserCallWidgetProps) {
  const demo = useProtectedPublicDemo(agentName, "showcase_browser_demo");
  const buttonText = demo.connecting
    ? "Connecting…"
    : demo.callActive
      ? "End call"
      : demo.completed
        ? "Demo complete"
        : buttonLabel;

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
            <span>End call</span>
          </>
        ) : demo.completed ? (
          <>
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            <span>Demo complete</span>
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" aria-hidden="true" />
            <span>{buttonLabel}</span>
          </>
        )}
      </ShadButton>

      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {demo.maxDurationSeconds}-second protected live demo
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
          <div className="flex h-3 items-end gap-0.5" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((bar) => {
              const scaled = demo.volume * (1 + bar * 0.3);
              const height = scaled > 0.01 ? Math.min(100, Math.max(15, scaled * 100)) : 15;
              return (
                <div
                  key={bar}
                  className="w-0.5 rounded-full bg-primary transition-all duration-75"
                  style={{ height: `${height}%`, opacity: demo.speakerActive ? 1 : 0.35 }}
                />
              );
            })}
          </div>
          <span className="font-mono text-[length:var(--wireline-typography-overline-size)] uppercase tracking-wider text-muted-foreground">
            {demo.speakerActive ? "Agent speaking" : "Listening"}
          </span>
        </div>
      ) : null}

      {demo.error ? (
        <div className="grid justify-items-center gap-2">
          <div
            className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1 text-[length:var(--wireline-typography-overline-size)] font-medium uppercase tracking-wider text-muted-foreground"
            role="alert"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{demo.error}</span>
          </div>
          {fallback}
        </div>
      ) : null}
    </div>
  );
}
