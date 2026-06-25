import { ArrowRight, Mail, MessageSquareText, PhoneCall, Plug, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingFooter from "./MarketingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import HeroCallPreview from "./HeroCallPreview";

const channels = [
  { label: "Calls", title: "Answer.", icon: PhoneCall },
  { label: "Text", title: "Reply.", icon: MessageSquareText },
  { label: "Email", title: "Follow up.", icon: Mail },
] as const;

const system = [
  { label: "Build", title: "Define the job." },
  { label: "Wire", title: "Connect the tools." },
  { label: "Run", title: "Review the work." },
] as const;

export default function PrecisionLanding() {
  return (
    <div className="wl-viewport-frame bg-background text-foreground">
      <PrecisionPublicHeader />
      <main id="main-content" className="wl-viewport-scroll pt-16" tabIndex={-1}>
        <section className="marketing-hero border-b border-border px-5 py-10 sm:px-6 lg:px-8">
          <div className="wl-public-rail grid min-h-[calc(100dvh-4rem)] items-center gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.76fr)] lg:gap-14">
            <div className="marketing-hero__content">
              <p className="wl-overline text-primary">Wireline OS</p>
              <h1 className="mt-4 max-w-[10ch] font-[var(--wireline-font-display)] text-[clamp(44px,6vw,76px)] font-semibold leading-[.98] tracking-[-.06em] text-foreground">
                Agents that answer.
              </h1>
              <p className="wl-public-copy mt-5 max-w-xl">
                Calls, texts, and follow-up. One workspace. Your rules.
              </p>
              <div className="marketing-hero__actions mt-8 flex flex-wrap gap-3">
                <Link to="/signup" className="marketing-btn-primary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]">
                  Start <ArrowRight size={16} />
                </Link>
                <Link to="/features" className="marketing-btn-secondary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]">
                  See system
                </Link>
              </div>
            </div>
            <HeroCallPreview />
          </div>
        </section>

        <section className="border-b border-border px-5 py-12 sm:px-6 lg:px-8">
          <div className="wl-public-rail">
            <p className="wl-overline text-primary">Channels</p>
            <h2 className="wl-public-section-heading mt-3">One brain. Every thread.</h2>
            <div className="marketing-channel-grid mt-8">
              {channels.map(({ label, title, icon: Icon }) => (
                <article key={label} className="wl-stitch-card marketing-channel-card flex flex-col p-6 sm:p-7">
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                  <p className="wl-overline mt-5 text-primary">{label}</p>
                  <h3 className="wl-section-title mt-2 text-[clamp(24px,4vw,32px)]">{title}</h3>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card px-5 py-12 sm:px-6 lg:px-8">
          <div className="wl-public-rail grid gap-8 lg:grid-cols-[minmax(0,.7fr)_minmax(0,1fr)] lg:items-start">
            <div>
              <p className="wl-overline text-primary">Operating model</p>
              <h2 className="wl-public-section-heading mt-3">Build. Wire. Run.</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {system.map(({ label, title }) => (
                <article key={label} className="wl-stitch-card p-5">
                  <p className="wl-overline text-primary">{label}</p>
                  <h3 className="wl-section-title mt-8 text-[clamp(20px,3vw,26px)]">{title}</h3>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-12 sm:px-6 lg:px-8">
          <div className="wl-public-rail">
            <div className="marketing-demo-surface">
              <div>
                <p className="wl-overline text-primary">Business-ready</p>
                <h2 className="mt-2 font-[var(--wireline-font-display)] text-[clamp(28px,4vw,44px)] font-semibold tracking-[-.05em]">
                  Useful work. Clean handoff.
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-[var(--wireline-typography-caption-size)] font-semibold text-foreground"><ShieldCheck size={15} /> Protected</span>
                <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-[var(--wireline-typography-caption-size)] font-semibold text-foreground"><Plug size={15} /> Connected</span>
                <Link to="/signup" className="marketing-btn-primary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]">
                  Start <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
