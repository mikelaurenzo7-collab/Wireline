import { CalendarCheck2, MessageSquareText, PhoneCall } from "lucide-react";

const capabilities = [
  {
    title: "The gatekeeper",
    description: "Handles the incoming conversation, captures what matters, and brings you in when it should.",
    note: "For personal coverage",
    icon: PhoneCall,
  },
  {
    title: "The scheduler",
    description: "Keeps appointments, confirmations, and changes moving with the context you connect.",
    note: "For organized follow-through",
    icon: CalendarCheck2,
  },
  {
    title: "The operator",
    description: "Qualifies requests, carries the thread forward, and keeps your team’s next step clear.",
    note: "For business momentum",
    icon: MessageSquareText,
  },
] as const;

export function Capabilities() {
  return (
    <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
      <div className="wl-public-rail">
        <p className="wl-overline text-primary">Start with the work</p>
        <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,.7fr)] lg:items-end lg:gap-10">
          <h2 className="wl-public-section-heading">Give every conversation a clear job.</h2>
          <p className="wl-public-copy max-w-xl lg:pb-1">
            Start from the job you need done, then shape the assistant around the voice, context, and handoff that make it useful.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {capabilities.map(({ title, description, note, icon: Icon }) => (
            <article key={title} className="wl-stitch-card flex min-h-[238px] flex-col p-6 sm:p-7">
              <span className="flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-primary/10 text-primary">
                <Icon size={19} aria-hidden="true" />
              </span>
              <h3 className="wl-section-title mt-8 text-[clamp(22px,3vw,28px)]">{title}</h3>
              <p className="mt-3 text-[var(--wireline-typography-caption-size)] leading-6 text-muted-foreground">{description}</p>
              <p className="mt-auto pt-6 font-mono text-[var(--wireline-typography-overline-size)] uppercase tracking-[.06em] text-muted-foreground">{note}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
