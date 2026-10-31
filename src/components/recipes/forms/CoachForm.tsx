/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
import { useState } from "react";
import { cn } from "../../../lib/utils";
import { FormShell, Field, TextArea, RunButton, ResultCard, ErrCard } from "../shared";
import { Checkbox } from "../../ui/shadcn/Checkbox";
import { useRecipeAsync } from "../useRecipeAsync";

export function CoachForm({
  callId,
  initial,
  disabled,
}: {
  callId?: string;
  initial?: any;
  disabled: boolean;
}) {
  const [transcript, setTranscript] = useState(initial?.transcript ?? "");
  const [isLive, setIsLive] = useState(initial?.isLive ?? false);
  const { loading, err, result: coaching, run } = useRecipeAsync("/api/claude/coach", "coaching");

  const submit = () => run({ transcript: callId ? undefined : transcript, callId, isLive });

  return (
    <FormShell>
      {!callId && (
        <Field label="Transcript" hint="Paste a transcript. Partial (live coaching) or complete.">
          <TextArea
            value={transcript}
            onChange={setTranscript}
            rows={10}
            placeholder="Customer: Hi, I called yesterday about…"
          />
        </Field>
      )}
      {callId && (
        <p className="text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.3em] text-muted">
          Coaching call{" "}
          <span className="text-brand font-mono">{callId.toString().slice(0, 8)}…</span>
        </p>
      )}
      <label className="flex items-center gap-3 cursor-pointer text-sm text-foreground/80">
        <Checkbox
          checked={isLive}
          onChange={(e) => setIsLive(e.target.checked)}
          className="w-4 h-4 rounded border-[var(--wireline-color-border-strong)] bg-muted accent-brand"
        />
        Treat as in-progress (live) call
      </label>
      <RunButton
        onClick={submit}
        loading={loading}
        disabled={disabled || (!transcript && !callId)}
        label="Coach Now"
      />

      {err && <ErrCard error={err} />}
      {coaching && (
        <div className="space-y-3 pt-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ResultCard title="Sentiment">
              <span
                className={cn(
                  "inline-flex px-3 py-1 rounded-full text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.3em]",
                  coaching.sentiment === "delighted" && "wl-status-success border wl-text-success",
                  coaching.sentiment === "positive" && "wl-status-success border wl-text-success",
                  coaching.sentiment === "neutral" &&
                    "bg-[var(--wireline-color-feedback-neutral-surface)] text-[var(--wireline-color-status-neutral)] border border-[var(--wireline-color-feedback-neutral-border)]",
                  coaching.sentiment === "frustrated" &&
                    "bg-[var(--wireline-color-feedback-warning-surface)] text-[var(--wireline-color-status-warning)] border border-[var(--wireline-color-feedback-warning-border)]",
                  coaching.sentiment === "angry" &&
                    "bg-[var(--wireline-color-feedback-error-surface)] text-[var(--wireline-color-status-error)] border border-[var(--wireline-color-feedback-error-border)]",
                )}
              >
                {coaching.sentiment}
              </span>
            </ResultCard>
            <ResultCard title="Engagement">
              <span className="inline-flex px-3 py-1 rounded-full text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.3em] bg-brand/15 text-brand border border-brand/30">
                {coaching.engagement}
              </span>
            </ResultCard>
            <ResultCard title="Escalation Risk">
              <span
                className={cn(
                  "inline-flex px-3 py-1 rounded-full text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.3em]",
                  coaching.escalation_risk === "imminent" &&
                    "bg-[var(--wireline-color-feedback-error-surface)] text-[var(--wireline-color-status-error)] border border-[var(--wireline-color-feedback-error-border)] motion-safe:animate-pulse",
                  coaching.escalation_risk === "high" &&
                    "bg-[var(--wireline-color-feedback-error-surface)] text-[var(--wireline-color-status-error)] border border-[var(--wireline-color-feedback-error-border)]",
                  coaching.escalation_risk === "medium" &&
                    "bg-[var(--wireline-color-feedback-warning-surface)] text-[var(--wireline-color-status-warning)] border border-[var(--wireline-color-feedback-warning-border)]",
                  coaching.escalation_risk === "low" &&
                    "bg-[var(--wireline-color-feedback-neutral-surface)] text-[var(--wireline-color-status-neutral)] border border-[var(--wireline-color-feedback-neutral-border)]",
                  coaching.escalation_risk === "none" && "wl-status-success border wl-text-success",
                )}
              >
                {coaching.escalation_risk}
              </span>
            </ResultCard>
          </div>
          <ResultCard title="Suggested Next Words" copyText={coaching.suggested_next_words}>
            <p className="font-display text-xl leading-snug text-foreground">
              "{coaching.suggested_next_words}"
            </p>
          </ResultCard>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ResultCard title="What's Working">
              <ul className="list-disc list-inside wl-text-success space-y-1">
                {coaching.whats_working.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </ResultCard>
            <ResultCard title="What's at Risk">
              <ul className="list-disc list-inside text-rose-500/90 space-y-1">
                {coaching.whats_at_risk.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </ResultCard>
          </div>
          {coaching.missed_opportunities?.length > 0 && (
            <ResultCard title="Missed Opportunities">
              <ul className="list-disc list-inside text-brand/90 space-y-1">
                {coaching.missed_opportunities.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </ResultCard>
          )}
          {coaching.compliance_alerts?.length > 0 && (
            <ResultCard title="Compliance Alerts">
              <ul className="list-disc list-inside text-rose-500/90 space-y-1">
                {coaching.compliance_alerts.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </ResultCard>
          )}
        </div>
      )}
    </FormShell>
  );
}
