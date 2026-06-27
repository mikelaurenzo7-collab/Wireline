export function SourceLivePreview() {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-5 shadow-[var(--wireline-elevation-sm)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--wireline-color-action-primary-default)] font-mono text-xs font-bold text-[var(--wireline-color-text-onAction)]">
            S
          </span>
          <div className="min-w-0">
            <strong className="block truncate text-sm text-[var(--wireline-color-text-primary)]">
              Sarah — Front Desk
            </strong>
            <small className="font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[.12em] text-[var(--wireline-color-status-success)]">
              On a call
            </small>
          </div>
        </div>
        <span className="rounded-full border border-[var(--wireline-color-border-default)] px-3 py-1 font-mono text-[var(--wireline-typography-overline-size)] font-bold uppercase tracking-[.1em] text-[var(--wireline-color-status-success)]">
          Live
        </span>
      </div>
      <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-subtle)] px-4 py-3 text-right font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[.1em] text-[var(--wireline-color-text-secondary)]">
        Answering · transcribing
      </div>
      <div className="mt-4 flex flex-col gap-2 text-[var(--wireline-typography-caption-size)] leading-5">
        <p className="max-w-[88%] rounded-[14px_14px_14px_4px] bg-[var(--wireline-color-surface-subtle)] px-3.5 py-2.5 text-[var(--wireline-color-text-secondary)]">
          I'd like to book a service estimate.
        </p>
        <p className="ml-auto max-w-[88%] rounded-[14px_14px_4px_14px] bg-[var(--wireline-color-action-primary-default)] px-3.5 py-2.5 text-[var(--wireline-color-text-onAction)]">
          Friday at 11:30 works — should I lock it in?
        </p>
        <p className="max-w-[88%] rounded-[14px_14px_14px_4px] bg-[var(--wireline-color-surface-subtle)] px-3.5 py-2.5 text-[var(--wireline-color-text-secondary)]">
          Yes, Friday is perfect.
        </p>
        <p className="ml-auto max-w-[88%] rounded-[14px_14px_4px_14px] bg-[var(--wireline-color-action-primary-default)] px-3.5 py-2.5 text-[var(--wireline-color-text-onAction)]">
          Booked. I'll text a confirmation now.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5 text-[var(--wireline-typography-overline-size)] font-medium text-[var(--wireline-color-status-success)]">
        <span className="rounded-full bg-[var(--wireline-color-feedback-success-surface)] px-2.5 py-1">
          ✓ Booked
        </span>
        <span className="rounded-full bg-[var(--wireline-color-feedback-success-surface)] px-2.5 py-1">
          ✓ SMS sent
        </span>
        <span className="rounded-full bg-[var(--wireline-color-feedback-success-surface)] px-2.5 py-1">
          ✓ Calendar updated
        </span>
      </div>
    </div>
  );
}
