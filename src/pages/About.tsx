import { Mail } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import WireSignalArt from "../components/marketing/WireSignalArt";

/* Positions, not benefits. Each line says something a visitor cannot learn from
   the plan cards or the feature grid: how the thing is built and who decides.
   The product claims live on /features and /pricing, and repeating them here is
   what turned this page into a second landing page. */
const POSITIONS = [
  {
    heading: "Independent",
    copy: "Built independently. Support goes directly to the founder.",
  },
  {
    heading: "Your Knowledge and Rules",
    copy: "Set each Bot's tone, knowledge, instructions, and handoffs.",
  },
  {
    heading: "Under Your Control",
    copy: "Calling-hour rules, Do Not Call checks, opt-outs, approvals, and escalation boundaries are enforced in the runtime before execution.",
  },
  {
    heading: "Visible Outcomes",
    copy: "Review calls, messages, handoffs, and outcomes in your workspace.",
  },
] as const;

/**
 * About is a statement page, not a second landing page.
 *
 * It is left-aligned where other public pages are centered, it is a numbered
 * column rather than a card grid, and it has no redundant primary CTA. The
 * global header already carries the path into Bot Studio.
 */
export default function About() {
  return (
    <MarketingPageFrame className="wl-about-page">
      <PageMeta
        title="ABOUT BOTBOUND | BOTS FOR CALLS AND FOLLOW-THROUGH"
        description="BotBound is an independent platform for Bots that call, text, and email. Set your knowledge and rules, review outcomes, and reach the founder directly for support."
        path="/about"
      />

      <section className="marketing-section marketing-section--screen">
        <div className="wl-public-rail grid gap-10 !text-left lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <p className="wl-eyebrow wl-eyebrow--wired text-primary">ABOUT</p>
            <h1 className="marketing-hero-title mt-4 max-w-[16ch] text-[clamp(1.9rem,3.4vw,2.9rem)]">
              BUILT BY THE FOUNDER WHO SUPPORTS YOU
            </h1>
            <WireSignalArt className="mt-8 h-12 max-w-sm" />
            <a
              href="mailto:support@botbound.me"
              className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              <span className="wl-preserve-case">support@botbound.me</span>
            </a>
          </div>

          <ol className="grid content-center gap-px overflow-hidden rounded-[16px] border border-border bg-border">
            {POSITIONS.map(({ heading, copy }, index) => (
              <li key={heading} className="grid gap-1 bg-card px-6 py-5 sm:grid-cols-[3rem_1fr]">
                <span className="font-mono text-xs font-semibold tracking-[.08em] text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2 className="wl-card-title">{heading}</h2>
                  <p className="mt-1.5 max-w-[52ch] text-sm leading-6 text-muted-foreground">
                    {copy}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
