/* eslint-disable @typescript-eslint/no-explicit-any -- recipe form primitives accept loose payload shapes by design. */
/**
 * Shared primitives used across every recipe form.
 *
 * FormShell / Field / TextInput / TextArea / Select / RunButton —
 * the minimal kit each recipe composes from. ResultCard / ErrCard /
 * Stat / NoKeyInline render the post-result surface.
 *
 * Keeping these in one tiny module means a recipe form is just a
 * data-flow + a JSX layout — no styling repetition.
 */

import React, { ReactNode, useId, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Copy, Loader2, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { Input } from "../ui/shadcn/Input";
import {
  Select as ShadSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/shadcn/Select";
import { ShadButton } from "../ui/shadcn/ShadButton";

export function FormShell({ children }: { children: ReactNode }) {
  return <div className="p-7 space-y-6">{children}</div>;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const hintId = useId();
  const inputId = useId();

  let processedChildren = children;
  if (React.isValidElement(children)) {
    const propsToInject: any = { id: inputId };
    if (hint) {
      propsToInject["aria-describedby"] = hintId;
    }
    processedChildren = React.cloneElement(children as React.ReactElement<any>, propsToInject);
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="app-section-title">
        {label}
      </label>
      {processedChildren}
      {hint && (
        <p id={hintId} className="wl-micro-meta--muted leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, ...rest }: any) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-12 rounded-md border border-[var(--wireline-color-border-strong)] bg-muted px-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      {...rest}
    />
  );
}

export function TextArea({ value, onChange, placeholder, rows = 5, ...rest }: any) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-none rounded-md border border-[var(--wireline-color-border-strong)] bg-muted px-4 py-3 font-sans text-sm leading-relaxed text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      {...rest}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <ShadSelect value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label="Recipe option"
        className="h-12 w-full rounded-md border border-[var(--wireline-color-border-strong)] bg-muted px-4 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </ShadSelect>
  );
}

export function RunButton({ onClick, loading, disabled, label = "Generate" }: any) {
  return (
    <ShadButton
      type="button"
      variant="editorial"
      disableAnimations
      onClick={onClick}
      disabled={loading || disabled}
      className="w-full min-h-12 py-4 text-[length:var(--wireline-typography-caption-size)] tracking-[0.32em] uppercase"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4" /> {label} <ArrowRight className="w-4 h-4" />
        </>
      )}
    </ShadButton>
  );
}

export const ResultCard: React.FC<{ title: string; copyText?: string; children?: ReactNode }> = ({
  title,
  children,
  copyText,
}) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative space-y-3 rounded-md border border-border wl-panel p-5">
      <div className="flex items-center justify-between">
        <h4 className="wl-label text-brand">{title}</h4>
        {copyText && (
          <ShadButton
            type="button"
            variant="ghost"
            size="sm"
            disableAnimations
            onClick={async () => {
              await navigator.clipboard.writeText(copyText);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="h-auto px-0 wl-label-muted hover:text-brand gap-1.5"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" /> Copy
              </>
            )}
          </ShadButton>
        )}
      </div>
      <div className="text-sm text-foreground/85 leading-relaxed space-y-2">{children}</div>
    </div>
  );
};

export function ErrCard({ error }: { error: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] p-4 text-sm text-[var(--wireline-color-status-error)]",
        "flex items-start gap-3",
      )}
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{error}</span>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="wl-label-muted">{label}</div>
      <div className="text-sm text-foreground mt-0.5 truncate">{value}</div>
    </div>
  );
}

export function NoKeyInline() {
  // White-label posture: customers never see "missing API key" copy.
  // If a required AI provider isn't reachable from the server, that's our
  // problem to fix on the backend (alerted via service logs +
  // /api/health/integrations). UI just shows a soft "warming up" state.
  return (
    <div className="flex items-center gap-3 border-y border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] px-7 py-4">
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--wireline-color-status-error)]" />
      <p className="text-xs text-foreground/80 leading-relaxed">
        BotBound AI is warming up. Try again in a moment. If this persists, our team is on it.
      </p>
    </div>
  );
}
