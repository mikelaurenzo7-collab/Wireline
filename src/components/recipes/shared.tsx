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

import React, { ReactNode, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Copy, Loader2, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";

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
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-[0.4em] text-muted">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted/70 leading-relaxed">{hint}</p>}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder }: any) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-12 px-4 rounded-xl bg-black/5 border border-black/10 outline-none text-ink text-sm placeholder:text-muted/65 focus:border-brand/60 focus:bg-black/10 transition-all"
    />
  );
}

export function TextArea({ value, onChange, placeholder, rows = 5 }: any) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-4 py-3 rounded-xl bg-black/5 border border-black/10 outline-none text-ink text-sm placeholder:text-muted/65 focus:border-brand/60 focus:bg-black/10 transition-all resize-none leading-relaxed font-sans"
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
    <select
      aria-label="Recipe option"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-12 px-4 rounded-xl bg-black/5 border border-black/10 outline-none text-ink text-sm focus:border-brand/60 transition-all"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function RunButton({ onClick, loading, disabled, label = "Generate" }: any) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="disabled:opacity-50 disabled:cursor-not-allowed brutal-btn w-full !py-4 !text-[12px] !tracking-[0.32em]"
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
    </button>
  );
}

export const ResultCard: React.FC<{ title: string; copyText?: string; children?: ReactNode }> = ({
  title,
  children,
  copyText,
}) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl glass border border-white/10 p-5 space-y-3 relative">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] uppercase tracking-[0.4em] text-brand">{title}</h4>
        {copyText && (
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(copyText);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="text-[10px] uppercase tracking-[0.3em] text-muted hover:text-brand flex items-center gap-1.5 transition-colors"
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
          </button>
        )}
      </div>
      <div className="text-sm text-ink/85 leading-relaxed space-y-2">{children}</div>
    </div>
  );
};

export function ErrCard({ error }: { error: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-rose-500 text-sm",
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
      <div className="text-[9px] uppercase tracking-[0.3em] text-muted">{label}</div>
      <div className="text-sm text-ink mt-0.5 truncate">{value}</div>
    </div>
  );
}

export function NoKeyInline() {
  // White-label posture: customers never see "missing API key" copy.
  // If our Anthropic key isn't reachable from the server, that's our
  // problem to fix on the backend (alerted via Vercel logs +
  // /api/health/integrations). UI just shows a soft "warming up" state.
  return (
    <div className="px-7 py-4 bg-amber-500/10 border-y border-amber-500/30 flex items-center gap-3">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
      <p className="text-xs text-ink/80 leading-relaxed">
        Wireline AI is warming up — try again in a moment. If this persists, our team is on it.
      </p>
    </div>
  );
}
