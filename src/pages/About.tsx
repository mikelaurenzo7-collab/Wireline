import { Link } from "react-router";
import { ArrowRight, Check, Mail } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import MarketingHero from "../components/marketing/MarketingHero";

const PRINCIPLES = [
  {
    title: "Voice agents that sound like you.",
    copy: "Custom-trained on your tone, scripts, and service knowledge.",
  },
  {
    title: "Built around every agent.",
    copy: "Your knowledge. Your playbook. Your tools. Built in.",
  },
  {
    title: "One voice agent, complete context.",
    copy: "Handles calls, follows up by text or email, books, and logs your way.",
  },
] as const;

export default function About() {
  return (
    <MarketingPageFrame className="wl-about-page">
      <PageMeta
        title="About Wireline | Voice Agents for Calls and Follow up"
        description="Wireline is a customizable agent platform built for calls, texts, follow up, browser context, email, and integrations."
        path="/about"
      />

      <MarketingHero
        title="Agents that run calls like you would."
        primaryAction={{ label: "Build your Voice Agent", to: "/pricing" }}
        secondaryAction={{
          label: "Contact Support",
          to: "/contact",
          tone: "secondary",
        }}
      />

      <section className="marketing-section border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[1.05rem] border border-border bg-border lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
          <div className="bg-card px-5 pb-4 pt-9 text-center sm:px-8 sm:py-12 lg:px-10 lg:py-12">
            <h2 className="wl-stitch-display text-balance">Independent. Direct line to us.</h2>
          </div>
          <div className="bg-card px-5 pb-9 pt-4 text-center sm:px-8 sm:py-12 lg:px-10 lg:py-12">
            <a
              href="mailto:support@trywireline.com"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <Mail className="h-4 w-4" />
              support@trywireline.com
            </a>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto grid max-w-4xl gap-6 text-center">
            <div>
              <h2 className="wl-stitch-display text-balance">Predictable, trained, brand-safe.</h2>
            </div>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {PRINCIPLES.map((principle) => (
              <article
                className="wl-stitch-card group p-6 text-center transition-all hover:-translate-y-px"
                key={principle.title}
              >
                <span className="mx-auto grid h-9 w-9 place-items-center rounded bg-muted text-primary transition group-hover:bg-primary/10">
                  <Check className="h-4 w-4 transition group-hover:scale-110" />
                </span>
                <h3 className="mt-6 text-lg font-semibold tracking-[-.025em] text-foreground">
                  {principle.title}
                </h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section border-t border-border bg-card">
        <div className="mx-auto grid max-w-4xl justify-items-center gap-9 text-center">
          <div>
            <h2 className="wl-stitch-display mx-auto max-w-2xl text-balance">
              Create your first voice agent.
            </h2>
          </div>
          <Link
            to="/pricing"
            className="marketing-btn-primary min-h-12 px-6 text-[length:var(--wireline-typography-body-size)] font-semibold"
          >
            Build your Voice Agent <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
