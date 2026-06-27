import { useState } from "react";
import { ArrowRight, Mail, MessageSquareText, PhoneCall } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingFooter from "./MarketingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";

const channels = [
  {
    label: "Calls",
    title: "Answer in your voice.",
    body: "Inbound, outbound, handoff, approvals, and clean summaries.",
    icon: PhoneCall,
  },
  {
    label: "Texts",
    title: "Keep the thread moving.",
    body: "Confirmations, follow-up, status updates, and handoff prompts.",
    icon: MessageSquareText,
  },
  {
    label: "Email",
    title: "Close the loop.",
    body: "Approved replies, recaps, next steps, and integration-backed work.",
    icon: Mail,
  },
] as const;

export default function PrecisionLanding() {
  return (
    <div className="wl-viewport-frame bg-background text-foreground">
      <PrecisionPublicHeader />
      <main id="main-content" className="wl-viewport-scroll pt-16" tabIndex={-1}>
        <section className="marketing-hero border-b border-border px-4 py-6 sm:px-5 sm:py-8 md:px-6 lg:px-8 safe-area-insets">
          <div className="wl-public-rail flex min-h-[calc(78dvh-4rem)] flex-col items-center justify-center py-4 text-center sm:py-6">
            <div className="marketing-hero__content flex flex-col items-center">
              <p className="wl-overline text-primary">Wireline OS</p>
              <h1 className="mx-auto mt-4 max-w-[18ch] font-[var(--wireline-font-display)] text-[clamp(46px,6.7vw,84px)] font-semibold leading-[.94] tracking-[-.055em] text-foreground">
                Agents for every conversation.
              </h1>
              <p className="wl-public-copy mx-auto mt-5 max-w-5xl text-[clamp(17px,1.7vw,22px)] leading-[1.38]">
                Calls, texts, follow-up. Handled.
              </p>
              <div className="marketing-hero__actions mt-8 justify-center">
                <Link
                  to="/signup"
                  className="marketing-btn-primary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                >
                  Create agent <ArrowRight size={16} />
                </Link>
                <Link
                  to="/features"
                  className="marketing-btn-secondary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                >
                  See OS
                </Link>
              </div>
            </div>
            <div className="marketing-hero-proof mt-8 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] tracking-[0.12em] text-muted-foreground">
              {["Create", "Train", "Run", "Calls", "Texts", "Follow-up"].map((item) => (
                <span key={item} className="px-1">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-12 sm:px-6 lg:px-8">
          <div className="wl-public-rail text-center">
            <div className="mx-auto max-w-3xl">
              <p className="wl-overline text-primary">First run</p>
              <h2 className="wl-public-section-heading mx-auto mt-3">
                Watch one agent become the front desk.
              </h2>
              <p className="wl-public-copy mx-auto mt-4">
                Call in. Answer. Capture. Follow-up queued. Approval ready.
              </p>
            </div>
            <div className="marketing-channel-grid mt-8 grid gap-4 sm:gap-6">
              {channels.map(({ label, title, body, icon: Icon }) => (
                <article
                  key={label}
                  className="marketing-channel-row group flex flex-col rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-primary/40 hover:shadow-md sm:p-7"
                >
                  <div className="marketing-channel-row__icon mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/5 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="wl-overline text-primary tracking-[0.08em]">{label}</p>
                    <h3 className="wl-section-title mt-2 text-[clamp(1.25rem,2.8vw,1.75rem)] leading-tight">
                      {title}
                    </h3>
                    <p className="mt-3 text-[var(--wireline-typography-body-size)] leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <Link
              to="/signup"
              className="marketing-btn-primary mx-auto mt-8 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
            >
              Start the run <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        <section className="border-b border-border px-5 py-12 sm:px-6 lg:px-8">
          <div className="wl-public-rail text-center">
            <div className="mx-auto max-w-3xl">
              <p className="wl-overline text-primary">One voice</p>
              <h2 className="wl-public-section-heading mx-auto mt-3">No drift.</h2>
              <p className="wl-public-copy mx-auto mt-4">Calls, texts, and email route through one trained agent.</p>
            </div>
            <SignalFlow />
            <LiveDirectSimulator />
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}

function SignalFlow() {
  return (
    <div className="mx-auto mt-8 grid max-w-4xl gap-3 rounded-[var(--radius-xl)] border border-border bg-card p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:p-6">
      <div className="grid gap-2 sm:justify-items-end">
        {channels.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="flex min-h-12 items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-background px-4 text-sm font-semibold"
          >
            <Icon className="size-4 text-primary" aria-hidden="true" />
            {label}
          </div>
        ))}
      </div>
      <div className="grid place-items-center gap-2 px-4 py-2">
        <div className="grid size-16 place-items-center rounded-2xl border border-border bg-background shadow-[var(--wireline-elevation-sm)]">
          <span className="font-mono text-lg font-semibold tracking-[-0.04em]">W</span>
        </div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Agent hub
        </p>
      </div>
      <div className="grid gap-2 text-left">
        {["Answer", "Summarize", "Follow up"].map((item) => (
          <div
            key={item}
            className="flex min-h-12 items-center rounded-[var(--radius-lg)] border border-border bg-background px-4 text-sm font-semibold"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveDirectSimulator() {
  const [active, setActive] = useState<string | null>(null);
  const trigger = (key: string) => {
    setActive(key);
    setTimeout(() => setActive(null), 1400);
  };

  return (
    <div className="mx-auto mt-5 max-w-4xl rounded-[var(--radius-xl)] border border-border bg-card p-5 text-left">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        <span>Direct live</span>
        <span className="font-mono">Create / Train / Run</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {channels.map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => trigger(label)}
            className={`group flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all active:scale-[0.985] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 ${
              active === label
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-background hover:border-primary/40 hover:bg-accent"
            }`}
            aria-pressed={active === label}
          >
            <Icon
              size={15}
              className={active === label ? "" : "text-primary/80 group-hover:text-primary"}
              aria-hidden="true"
            />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 flex justify-center">
        <div className="relative flex h-12 w-full max-w-[420px] items-center justify-center rounded-full border border-border/60 bg-background transition-all">
          <div
            className={`absolute h-2 w-2 rounded-full bg-primary transition-all duration-200 ${active ? "scale-150 opacity-95" : "scale-100 opacity-40"}`}
          />
          <span className="text-[10px] font-mono tracking-[0.12em] text-muted-foreground">
            {active ? `${active.toUpperCase()} -> AGENT HUB -> ACTION` : "AGENT HUB / ONE VOICE"}
          </span>
        </div>
      </div>
    </div>
  );
}