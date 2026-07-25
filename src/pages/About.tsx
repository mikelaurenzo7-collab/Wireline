import { Link } from "react-router-dom";
import { ArrowRight, Check, Mail, ShieldCheck } from "lucide-react";
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
    title: "One agent, complete context.",
    copy: "Handles calls, follows up by text or email, books, and logs your way.",
  },
] as const;

const ABOUT_HERO_ITEMS = ["Your training", "Your voice", "Your playbook", "Your outcomes"] as const;

export default function About() {
  return (
    <MarketingPageFrame className="wl-about-page" mainClassName="!px-0 pb-0 pt-16">
      <PageMeta
        title="About Wireline | AI Agents for Calls and Follow-up"
        description="Wireline is a customizable agent platform built for calls, texts, follow-up, browser context, email, and integrations."
        path="/about"
      />

      <MarketingHero
        eyebrow="About Wireline"
        title="Agents that run your calls exactly like you would."
        description="Train them on your business, voice, and playbook—then hold every call and follow-up to your standard."
        primaryAction={{ label: "Get started now", to: "/pricing" }}
        secondaryAction={{ label: "Contact support", to: "/contact", tone: "secondary" }}
        proof={ABOUT_HERO_ITEMS}
      />

      <section className="wl-public-section border-y border-border bg-card">
        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[1.05rem] border border-border bg-border lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
          <div className="bg-card px-5 py-9 text-center sm:px-8 sm:py-12 lg:px-10">
            <p className="wl-stitch-eyebrow">Built with accountability</p>
            <h2 className="wl-stitch-display mt-3 text-balance">
              Built independently, with a direct line to the people improving it.
            </h2>
          </div>
          <div className="bg-card px-5 py-9 text-center sm:px-8 sm:py-12 lg:px-10">
            <p className="mx-auto max-w-xl text-base leading-7 text-muted-foreground">
              Independently built. Every agent is fully customizable—your training, voice, and
              playbook.
            </p>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              Automate customer conversations, catch hot opportunities, and scale front-desk and
              sales qualification without losing quality.
            </p>
            <a
              href="mailto:support@trywireline.com"
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <Mail className="h-4 w-4" />
              support@trywireline.com
            </a>
          </div>
        </div>
      </section>

      <section className="wl-public-section">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto grid max-w-4xl gap-6 text-center">
            <div>
              <p className="wl-stitch-eyebrow">What guides the product</p>
              <h2 className="wl-stitch-display mt-3 text-balance">
                A business agent should be predictable, trained, and brand-safe.
              </h2>
            </div>
            <p className="mx-auto max-w-xl text-base leading-7 text-muted-foreground">
              Answer inbound queries, qualify sales opportunities, book calendar invites, and follow
              your operating playbook consistently.
            </p>
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
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{principle.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="wl-public-section border-t border-border bg-card">
        <div className="mx-auto grid max-w-4xl justify-items-center gap-9 text-center">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Your custom agent begins as a private draft.
            </p>
            <h2 className="wl-stitch-display mx-auto mt-4 max-w-2xl text-balance">
              Create your first custom front-desk or sales employee.
            </h2>
          </div>
          <Link
            to="/pricing"
            className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-body-size)] font-semibold"
          >
            Get started now <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
