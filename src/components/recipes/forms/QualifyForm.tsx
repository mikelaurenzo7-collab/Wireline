/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "../../../lib/utils";
import { FormShell, Field, TextArea, RunButton, ResultCard, ErrCard } from "../shared";
import { useRecipeAsync } from "../useRecipeAsync";

export function QualifyForm({
  callId,
  initial,
  disabled,
}: {
  callId?: string;
  initial?: any;
  disabled: boolean;
}) {
  const [transcript, setTranscript] = useState(initial?.transcript ?? "");
  const { loading, err, result: q, run } = useRecipeAsync("/api/claude/qualify", "qualification");

  const submit = () =>
    run({ source: "voice_call", transcript: callId ? undefined : transcript, callId });

  return (
    <FormShell>
      {!callId && (
        <Field
          label="Transcript or Email Body"
          hint="Paste the conversation text. Wireline AI scores it against BANT with evidence."
        >
          <TextArea
            value={transcript}
            onChange={setTranscript}
            placeholder="Customer: I'm exploring options for our 200-seat team…"
            rows={10}
          />
        </Field>
      )}
      {callId && (
        <p className="text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.3em] text-muted">
          Qualifying call{" "}
          <span className="text-brand font-mono">{callId.toString().slice(0, 8)}…</span> from log
        </p>
      )}
      <RunButton
        onClick={submit}
        loading={loading}
        disabled={disabled || (!transcript && !callId)}
        label="Score Lead"
      />

      {err && <ErrCard error={err} />}
      {q && (
        <div className="space-y-4 pt-3">
          <div className="rounded-md p-6 wl-panel-elevated border border-white/12 flex items-center justify-between">
            <div>
              <div className="app-section-title mb-2">Aggregate</div>
              <div className="font-display text-6xl text-brand-display leading-none">
                {q.total_score}
              </div>
            </div>
            <div className="text-right">
              <div className="app-section-title mb-2">Label</div>
              <div
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.3em]",
                  q.qualification_label === "hot" &&
                    "bg-rose-500/15 border border-rose-500/40 text-rose-500",
                  q.qualification_label === "warm" &&
                    "bg-brand/15 border border-brand/40 text-brand",
                  q.qualification_label === "cool" &&
                    "bg-black/[0.06] border border-white/15 text-foreground/50",
                  q.qualification_label === "cold" &&
                    "bg-black/8 border border-white/15 text-foreground/55",
                  q.qualification_label === "disqualified" &&
                    "bg-rose-700/15 border border-rose-700/40 text-rose-500",
                )}
              >
                <Sparkles className="w-3 h-3" />
                {q.qualification_label}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(["budget", "authority", "need", "timeline"] as const).map((k) => (
              <ResultCard key={k} title={k}>
                <div className="flex items-baseline justify-between mb-2">
                  <div className="font-display text-3xl text-foreground">{q[k].score}</div>
                  <div className="wl-label-muted">/ 100</div>
                </div>
                <p className="text-sm text-foreground/70">{q[k].evidence}</p>
              </ResultCard>
            ))}
          </div>
          <ResultCard title="Recommended Next Step">
            <p>{q.recommended_next_step}</p>
          </ResultCard>
          <ResultCard title="Reasoning">
            <p className="text-foreground/65">{q.reasoning}</p>
          </ResultCard>
        </div>
      )}
    </FormShell>
  );
}
