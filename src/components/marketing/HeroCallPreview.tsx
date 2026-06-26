import { Calendar, Check, MessageSquare, PhoneCall } from "lucide-react";

const BAR_COUNT = 28;
const BAR_HEIGHT = (index: number) => 8 + ((index * 7) % 18);

export default function HeroCallPreview() {
  return (
    <div
      className="wl-hero-call-preview relative mx-auto w-full max-w-xl text-left"
      aria-label="Live call preview: a Wireline agent answering an inbound call and booking an appointment"
    >
      <div className="overflow-hidden border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center border border-border bg-secondary font-[var(--wireline-font-display)] text-base font-semibold text-primary">
            S
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[var(--wireline-typography-body-size)] font-semibold tracking-[-.02em] text-foreground">
              Sarah
              <span className="border border-primary/20 bg-accent px-1.5 py-0.5 font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.12em] text-primary">
                Warm
              </span>
            </div>
            <p className="mt-0.5 text-[var(--wireline-typography-caption-size)] text-muted-foreground">
              Front desk - inbound support
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-2 font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.08em] text-muted-foreground sm:inline-flex">
            <span className="size-1.5 bg-primary" aria-hidden="true" />
            Active
          </span>
        </div>

        <div
          className="flex h-12 items-end justify-center gap-[3px] border-b border-border bg-secondary px-4"
          aria-hidden="true"
        >
          {Array.from({ length: BAR_COUNT }).map((_, index) => (
            <span
              key={index}
              className="flex-1 max-w-[4px] bg-primary/55"
              style={{ height: `${BAR_HEIGHT(index)}px` }}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
          <div className="max-w-[88%] border border-border bg-secondary px-3 py-2.5 text-[var(--wireline-typography-caption-size)] leading-snug text-foreground">
            <span className="mb-1.5 block font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.14em] text-muted-foreground">
              Caller
            </span>
            Hi. Any openings this Saturday?
          </div>

          <div className="ml-auto max-w-[88%] border border-primary/18 bg-accent px-3 py-2.5 text-[var(--wireline-typography-caption-size)] leading-snug text-foreground">
            <span className="mb-1.5 block font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.14em] text-muted-foreground">
              Sarah
            </span>
            We do. 9:30 or 2:15. Want me to lock one in?
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 border-t border-border px-4 py-3 sm:px-5">
          <span className="grid h-[18px] w-[18px] shrink-0 place-items-center bg-primary text-primary-foreground">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
          <span className="text-[var(--wireline-typography-caption-size)] text-foreground">
            <strong className="font-semibold">Appointment ready.</strong> Sat 9:30 AM
          </span>
          <span className="ml-auto flex gap-1.5">
            <span className="inline-flex items-center gap-1 border border-border px-1.5 py-1 font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.1em] text-muted-foreground">
              <Calendar className="h-2.5 w-2.5" aria-hidden="true" />
              Calendar
            </span>
            <span className="inline-flex items-center gap-1 border border-border px-1.5 py-1 font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.1em] text-muted-foreground">
              <MessageSquare className="h-2.5 w-2.5" aria-hidden="true" />
              SMS
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-secondary px-4 py-2.5 font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.1em] text-primary sm:px-5">
          <PhoneCall className="h-3 w-3" aria-hidden="true" />
          Active call - handled by agent
        </div>
      </div>
    </div>
  );
}
