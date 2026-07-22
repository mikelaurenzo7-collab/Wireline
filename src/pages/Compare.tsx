import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Brain,
  CalendarCheck,
  Check,
  Clock3,
  ExternalLink,
  Globe,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import MarketingHero from "../components/marketing/MarketingHero";

const DIFFERENCES = [
  {
    icon: PhoneCall,
    title: "It makes the call.",
    copy: "Handles the conversation — voice, email, or text.",
  },
  {
    icon: MessageSquare,
    title: "You explain it normally.",
    copy: "Your voice, playbook, and Training — no scripts, no flowcharts.",
  },
  {
    icon: Clock3,
    title: "You get the answer back.",
    copy: "A clear next step: booked, handed off, or logged.",
  },
  {
    icon: Brain,
    title: "It remembers what you taught it.",
    copy: "Every lesson, objection, and preference stays in the agent's memory.",
  },
  {
    icon: CalendarCheck,
    title: "It books real time on your calendar.",
    copy: "Availability checks, timezone-aware, no double-booking.",
  },
  {
    icon: Workflow,
    title: "It works across channels.",
    copy: "Starts on voice, follows up by email or text — connected and coherent.",
  },
  {
    icon: Globe,
    title: "It handles after-hours coverage.",
    copy: "24/7 without overtime, burnout, or missed calls.",
  },
  {
    icon: BarChart3,
    title: "You see every outcome.",
    copy: "Transcripts, summaries, and analytics for every conversation.",
  },
  {
    icon: Sparkles,
    title: "It improves with every call.",
    copy: "Post-call review in Studio captures lessons today — the automated learning loop is in beta.",
  },
] as const;

const MARKET_OPTIONS = [
  {
    name: "Wireline",
    price: "$0 to build · live from $9/mo",
    usage: "20 included live-voice minutes, one number slot, and prepaid overflow on Starter",
    fit: "Owners who want one trained employee across voice, SMS, email, follow-up, and outcomes",
    href: "/pricing",
    source: "Wireline pricing",
    internal: true,
  },
  {
    name: "Goodcall",
    price: "$79/agent/mo",
    usage: "Unlimited minutes and tokens; 100 unique customers monthly on Starter",
    fit: "Flat-rate AI phone answering where customer-count limits fit the call pattern",
    href: "https://www.goodcall.com/pricing",
    source: "Goodcall pricing",
    internal: false,
  },
  {
    name: "Smith.ai",
    price: "$0 free · Pro from $150/mo",
    usage: "25 live calls on Free; 75 included live calls on the first paid Pro tier",
    fit: "AI receptionist buyers who prefer per-call capacity and service-backed tiers",
    href: "https://smith.ai/pricing/ai-receptionist",
    source: "Smith.ai pricing",
    internal: false,
  },
  {
    name: "Bland",
    price: "$0 platform · $0.14/min",
    usage: "AI voice rate on Start; telephony is billed separately",
    fit: "Developers assembling voice infrastructure and integrations themselves",
    href: "https://www.bland.ai/pricing",
    source: "Bland pricing",
    internal: false,
  },
  {
    name: "Retell",
    price: "$0.07–$0.31/min",
    usage: "Pay-as-you-go voice components; phone numbers and messaging have separate rates",
    fit: "Developers optimizing model, voice, telephony, and add-on choices per deployment",
    href: "https://www.retellai.com/pricing",
    source: "Retell pricing",
    internal: false,
  },
] as const;

const TABLE_ROWS = [
  ["Call during business hours", "Your agent can handle routine coverage"],
  ["Wait on hold", "Your agent waits and reports back"],
  ["Repeat the same details", "Your agent keeps the instructions"],
  ["Receive another task", "You get a clear next step"],
  ["Miss after-hours calls", "Your agent picks up 24/7, no voicemail tag"],
  ["Train a new receptionist", "Your agent ships with your playbook on day one"],
  ["Log calls manually in a CRM", "Your agent writes the summary and syncs the record"],
  [
    "Follow up on every inbound lead",
    "Your agent qualifies, books, or hands off — nothing falls through",
  ],
] as const;

const COMPARE_HERO_PROOF = ["Make the call", "Keep the result", "Improve the next one"] as const;

export default function Compare() {
  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-16">
      <PageMeta
        title="Why Wireline"
        description="Compare Wireline's owner-ready AI employee with per-agent, per-call, and developer voice-infrastructure pricing."
        path="/compare"
      />

      <MarketingHero
        eyebrow="Why Wireline"
        title="Wireline vs. other voice AI."
        description="Compare the buying model—not only the headline price. One trained employee across voice, SMS, and email, with prepaid overflow instead of surprise per-call bills."
        primaryAction={{ label: "Start free", to: "/signup?plan=personal" }}
        secondaryAction={{ label: "Hear a demo", to: "/showcase", tone: "secondary" }}
        proof={COMPARE_HERO_PROOF}
      />

      <section className="border-y border-border bg-card px-5 py-5 sm:px-8 sm:py-7">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden border border-border bg-border md:grid-cols-3">
          {DIFFERENCES.map(({ icon: Icon, title, copy }) => (
            <article className="bg-card px-5 py-8 text-center sm:px-7 sm:py-10" key={title}>
              <span className="mx-auto grid h-9 w-9 place-items-center rounded bg-muted text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <h2 className="mt-6 text-lg font-semibold tracking-[-.025em] text-foreground">
                {title}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {copy}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="wl-stitch-eyebrow">Market reference · Verified July 19, 2026</p>
            <h2 className="wl-stitch-display mt-3 text-balance">
              Compare the buying model, not only the headline price.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              These products sell different things. Some meter minutes, calls, or unique customers.
              Wireline bundles a trained, multichannel employee with visible capacity and prepaid
              overflow. The honest comparison is what you receive and what can make the bill move.
            </p>
          </div>

          <div className="mt-8 overflow-x-auto border border-border bg-card">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <caption className="sr-only">
                Public launch pricing and buying-model comparison for Wireline and selected
                alternatives
              </caption>
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Option
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Public entry price
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Usage boundary
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Best fit
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {MARKET_OPTIONS.map((option, index) => (
                  <tr
                    className={
                      (index ? "border-t border-border " : "") +
                      (option.internal ? "bg-primary/[0.06]" : "bg-card")
                    }
                    key={option.name}
                  >
                    <th className="px-5 py-5 align-top text-sm font-semibold text-foreground">
                      {option.name}
                      {option.internal ? (
                        <span className="ml-2 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                          This product
                        </span>
                      ) : null}
                    </th>
                    <td className="px-5 py-5 align-top text-sm font-semibold text-foreground">
                      {option.price}
                    </td>
                    <td className="max-w-xs px-5 py-5 align-top text-sm leading-6 text-muted-foreground">
                      {option.usage}
                    </td>
                    <td className="max-w-sm px-5 py-5 align-top text-sm leading-6 text-muted-foreground">
                      {option.fit}
                    </td>
                    <td className="px-5 py-5 align-top text-sm">
                      {option.internal ? (
                        <Link
                          className="inline-flex items-center gap-1.5 font-medium text-primary"
                          to={option.href}
                        >
                          {option.source} <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <a
                          className="inline-flex items-center gap-1.5 font-medium text-primary"
                          href={option.href}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {option.source} <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 max-w-4xl text-xs leading-5 text-muted-foreground">
            Public prices were checked on the linked official pages on July 19, 2026 and may change.
            Taxes, carrier fees, optional add-ons, annual discounts, implementation services, and
            usage patterns can change the effective total. This is a buying-model reference,{" "}
            {"not a claim that unlike products are feature-for-feature equivalents."}
          </p>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-4xl gap-8">
          <div className="text-center">
            <p className="wl-stitch-eyebrow">A simpler default</p>
            <h2 className="wl-stitch-display mt-3 text-balance">
              The routine call should not become a project.
            </h2>
          </div>
          <div className="overflow-hidden border border-border bg-card">
            {TABLE_ROWS.map(([before, after], index) => (
              <div
                className={
                  (index ? "border-t border-border " : "") + "grid gap-5 p-5 sm:grid-cols-2 sm:p-6"
                }
                key={before}
              >
                <p className="text-sm leading-6 text-muted-foreground">{before}</p>
                <p className="flex gap-2 text-sm font-medium leading-6 text-foreground">
                  <Check className="mt-1 h-4 w-4 flex-none text-primary" />
                  {after}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-card px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-4xl justify-items-center gap-9 text-center">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              You shape the agent.
            </p>
            <h2 className="wl-stitch-display mx-auto mt-4 max-w-2xl text-balance">
              You stay in control of every agent.
            </h2>
          </div>
          <Link
            to="/signup?plan=personal"
            className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-body-size)] font-semibold"
          >
            Wire agent <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
