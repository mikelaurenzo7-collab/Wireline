/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
import { cn } from "../../../lib/utils";
import { FormShell, RunButton, ResultCard, ErrCard } from "../shared";
import { useRecipeAsync } from "../useRecipeAsync";

export function ThreadSummaryForm({
  threadId,
  disabled,
}: {
  threadId?: string;
  disabled: boolean;
}) {
  const {
    loading,
    err,
    result: s,
    run,
  } = useRecipeAsync("/api/claude/summarize-thread", "summary");

  const submit = () => {
    if (!threadId) return;
    run({ threadId });
  };

  return (
    <FormShell>
      {!threadId && <ErrCard error="Open a thread to summarize it." />}
      {threadId && (
        <p className="text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.3em] text-muted">
          Summarizing thread <span className="text-brand font-mono">{threadId.slice(0, 8)}…</span>
        </p>
      )}
      <RunButton
        onClick={submit}
        loading={loading}
        disabled={disabled || !threadId}
        label="Summarize"
      />

      {err && <ErrCard error={err} />}
      {s && (
        <div className="space-y-3 pt-3">
          <ResultCard title="Summary" copyText={s.summary}>
            <p>{s.summary}</p>
          </ResultCard>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ResultCard title="Sentiment">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.3em]",
                  s.sentiment === "positive" && "wl-status-success border wl-text-success",
                  s.sentiment === "delighted" && "wl-status-success border wl-text-success",
                  s.sentiment === "neutral" &&
                    "bg-black/[0.06] text-foreground/50 border border-white/12",
                  s.sentiment === "frustrated" &&
                    "bg-amber-500/15 text-amber-500 border border-amber-500/30",
                  s.sentiment === "angry" &&
                    "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                )}
              >
                {s.sentiment}
              </span>
            </ResultCard>
            <ResultCard title="Urgency">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.3em]",
                  s.urgency === "low" &&
                    "bg-black/[0.06] text-foreground/50 border border-white/12",
                  s.urgency === "medium" && "bg-brand/15 text-brand border border-brand/30",
                  s.urgency === "high" &&
                    "bg-amber-500/15 text-amber-500 border border-amber-500/30",
                  s.urgency === "critical" &&
                    "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                )}
              >
                {s.urgency}
              </span>
            </ResultCard>
          </div>
          <ResultCard title="Key Points">
            <ul className="list-disc list-inside space-y-1">
              {s.key_points.map((k: string, i: number) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </ResultCard>
          <ResultCard title="Action Items">
            <ul className="space-y-2">
              {s.action_items.map((a: any, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "shrink-0 px-2 py-0.5 rounded-full wl-label mt-0.5",
                      a.owner === "us"
                        ? "bg-brand/15 text-brand border border-brand/30"
                        : "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                    )}
                  >
                    {a.owner}
                  </span>
                  <span>
                    {a.description}
                    {a.due_hint ? (
                      <span className="text-muted ml-2 italic text-xs">— {a.due_hint}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </ResultCard>
          <ResultCard title="Recommended Next Step">
            <p>{s.recommended_next_step}</p>
          </ResultCard>
        </div>
      )}
    </FormShell>
  );
}
