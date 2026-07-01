import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  Contact,
  MessageSquareText,
  PhoneCall,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
} from "lucide-react";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import MarketingFooter from "../components/marketing/MarketingFooter";
import { PageMeta } from "../lib/page-meta";
import { PRODUCT_VERSATILITY } from "../lib/product-copy";

const OUTCOMES = ["Handle", "Qualify", "Schedule"] as const;
const CUSTOMIZATION = [
  ["Voice & tone", "Yours"],
  ["Workflow & handoff", "Yours"],
  ["Connected tools", "Approved"],
] as const;
const USE_CASES = [
  { title: "Personal calls", icon: PhoneCall },
  { title: "Appointments", icon: CalendarClock },
  { title: "Business front desk", icon: Contact },
  { title: "SMS follow-up", icon: MessageSquareText },
  { title: "Lead qualification", icon: SlidersHorizontal },
  { title: "Custom workflows", icon: Workflow },
] as const;

export default function Features() {
  return (
    <div className="marketing-surface min-h-screen bg-background text-foreground">
      <PageMeta
        title="AI phone agents for calls, texts, and follow-up | Wireline"
        description="Create, train, and run AI phone agents that answer calls, book appointments, take messages, route handoffs, and follow up across calls, SMS, email, and connected tools."
        path="/features"
      />
      <PrecisionPublicHeader />
      <main id="main-content" className="pt-16 safe-area-insets" tabIndex={-1}>
        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-20 lg:px-8">
          <div className="wl-public-rail">
            <p className="wl-overline text-primary">How it works</p>
            <h1 className="mx-auto mt-4 max-w-[13ch] font-[var(--wireline-font-display)] text-[clamp(38px,5.4vw,60px)] font-semibold leading-[1.04] tracking-[-.05em] text-foreground">
              Give every conversation a clear next step.
            </h1>
            <p className="wl-public-copy mt-5">{PRODUCT_VERSATILITY.tagline}</p>
            <div className="marketing-hero__actions mt-8">
              <Link
                to="/signup"
                className="marketing-btn-primary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                Start free
              </Link>
              <Link
                to="/showcase"
                className="marketing-btn-secondary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                <Play size={15} /> Hear a demo
              </Link>
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail grid gap-3 lg:grid-cols-2 lg:gap-4">
            <article className="wl-stitch-card group flex min-h-[12rem] flex-col items-center rounded-xl p-5 text-center transition-all hover:-translate-y-px hover:shadow-sm sm:min-h-[16rem] sm:p-8">
              <MessageSquareText
                size={24}
                className="text-primary transition group-hover:scale-110"
              />
              <h2 className="wl-section-title mt-5 max-w-[16ch]">
                Conversations that stay on task.
              </h2>
              <div className="mt-auto flex flex-wrap justify-center gap-2 pt-6 sm:pt-8">
                {OUTCOMES.map((outcome) => (
                  <span
                    key={outcome}
                    className="rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-medium text-foreground"
                  >
                    {outcome}
                  </span>
                ))}
              </div>
            </article>
            <article className="wl-stitch-card group flex min-h-[12rem] flex-col items-center rounded-xl p-5 text-center transition-all hover:-translate-y-px hover:shadow-sm sm:min-h-[16rem] sm:p-8">
              <ShieldCheck size={24} className="text-primary transition group-hover:scale-110" />
              <h2 className="wl-section-title mt-5">Made to fit your work.</h2>
              <dl className="mt-6 divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border sm:mt-auto">
                {CUSTOMIZATION.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-4 px-3 py-3 sm:px-4 sm:py-3.5"
                  >
                    <dt className="text-sm text-foreground sm:text-[var(--wireline-typography-body-size)]">
                      {label}
                    </dt>
                    <dd className="wl-overline text-primary">{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>
        </section>

        <section className="px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {USE_CASES.map(({ title, icon: Icon }) => (
                <Link
                  key={title}
                  to="/signup"
                  className="group flex min-h-[7.5rem] flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-sm"
                >
                  <Icon size={20} className="text-primary" aria-hidden="true" />
                  <span className="mt-6 flex items-center justify-between gap-3 text-[1rem] font-semibold tracking-[-.02em] text-foreground">
                    {title}
                    <ArrowRight size={16} className="text-primary transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
