import { Link } from "react-router-dom";
import { ArrowRight, Check, Mail, ShieldCheck } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import WirelineMark from "../components/WirelineMark";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";

const PRINCIPLES = [
  {
    title: "Voice agents that sound like you.",
    copy: "Custom-trained on your tone, scripts, and service knowledge.",
  },
  {
    title: "Deep customization per agent.",
    copy: "Your knowledge base. Your boundaries. Your tools. Built in.",
  },
  {
    title: "One agent, complete context.",
    copy: "Handles calls, follows up by text/email, books, and logs everything your way.",
  },
] as const;

export default function About() {
  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta
        title="About Wireline | AI Business Front Desk & Sales Agents"
        description="Wireline is a customizable AI Front Desk & Sales Agent platform built to automate business reception, qualify leads, and sync with your CRM."
        path="/about"
      />

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:px-10">
        <div className="max-w-3xl">
          <p className="wl-stitch-eyebrow">About Wireline</p>
          <h1 className="wl-stitch-marketing-hero mt-4 text-balance">
            Custom voice agents for your business calls and workflows.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
            Build custom voice agents with your knowledge, your voice, and your exact processes.
          </p>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-5 sm:px-8 sm:py-7">
        <div className="mx-auto grid max-w-6xl overflow-hidden border border-border bg-border lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
          <div className="bg-card px-5 py-9 sm:px-8 sm:py-12 lg:px-10">
            <div className="grid h-14 w-14 place-items-center rounded bg-primary text-primary-foreground">
              <WirelineMark className="h-7 w-7" strokeWidth={120} />
            </div>
            <p className="wl-stitch-eyebrow mt-6">Built with accountability</p>
            <h2 className="wl-stitch-display mt-3 text-balance">
              Built independently, with a direct line to the people improving it.
            </h2>
          </div>
          <div className="bg-card px-5 py-9 sm:px-8 sm:py-12 lg:px-10">
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              Independently built. Every voice agent is fully customizable. Your knowledge. Your
              voice, your rules.
            </p>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              The goal is simple: empower businesses to automate customer interactions, capture hot
              opportunities instantly, and scale front-desk reception and sales qualification
              seamlessly.
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

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)] lg:items-end">
          <div>
            <p className="wl-stitch-eyebrow">What guides the product</p>
            <h2 className="wl-stitch-display mt-3 text-balance">
              A business agent should be completely predictable, custom-trained, and brand-safe.
            </h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-muted-foreground">
            Wireline is designed around enterprise-grade execution: answer inbound queries, qualify
            sales opportunities, book CRM-synced calendar invites, and follow custom rules
            perfectly.
          </p>
        </div>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {PRINCIPLES.map((principle) => (
            <article className="wl-stitch-card p-6" key={principle.title}>
              <span className="grid h-9 w-9 place-items-center rounded bg-muted text-primary">
                <Check className="h-4 w-4" />
              </span>
              <h3 className="mt-6 text-lg font-semibold tracking-[-.025em] text-foreground">
                {principle.title}
              </h3>
              {/* Details shown in action on other pages */}
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-card px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Your custom agent begins as a private draft.
            </p>
            <h2 className="wl-stitch-display mt-4 max-w-2xl text-balance">
              Deploy your first custom front-desk or sales agent.
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
