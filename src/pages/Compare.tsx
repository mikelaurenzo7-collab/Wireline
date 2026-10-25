import { Link } from "react-router";
import { ArrowRight, Check, ChevronDown, ExternalLink } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import { PUBLIC_ENTRY_PLANS, publicPriceSummary } from "../lib/public-plan-lineup";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { usePaidPlanAvailability } from "../hooks/usePaidPlanAvailability";
import { PUBLIC_USAGE_TIERS, USAGE_TIERS } from "../lib/usage-billing-catalog";

const entryUsageTier = USAGE_TIERS[PUBLIC_USAGE_TIERS[0]];

const DIFFERENCES = [
  {
    title: "Works Across Channels",
    copy: "Handles calls, SMS, email, and Computer tasks with your knowledge and rules. Outcomes stay in one workspace.",
  },
  {
    title: "Plain Instructions",
    copy: "Your voice, playbook, knowledge, and rules. No flowchart required.",
  },
  {
    title: "A Clear Next Step",
    copy: "Uses enabled tools to book, hand off, follow up, or record the outcome.",
  },
  {
    title: "Real Calendar Booking",
    copy: "Checks your configured hours, timezone, buffers, and imported busy times before supported bookings.",
  },
  {
    title: "After Hours Coverage",
    copy: "Can answer around the clock within your configured runtime and routing rules.",
  },
  {
    title: "Every Outcome Visible",
    copy: "Completed conversations can produce transcripts, summaries, actions, and analytics.",
  },
] as const;

const MARKET_OPTIONS = [
  {
    name: "BotBound",
    price: publicPriceSummary(),
    usage: `The entry Calls plan includes ${PUBLIC_ENTRY_PLANS.calls.voice_minutes_monthly} minutes and one local number. Email and combined channel activation follow a setup review.`,
    fit: "Owners who want a Bot with the channels they choose, connected tools, and logged outcomes",
    href: "/pricing",
    source: "BotBound pricing",
    internal: true,
  },
  {
    name: "Goodcall",
    price: "$79/mo Starter",
    usage:
      "100 unique customers/mo, then $0.79 each; no per minute charge. AI test runs have a separate allowance.",
    fit: "Flat rate AI phone answering where customer count limits fit the call pattern",
    href: "https://www.goodcall.com/pricing",
    source: "Goodcall pricing",
    internal: false,
  },
  {
    name: "Smith.ai",
    price: "$0 free · Pro from $150/mo",
    usage: "25 live calls on Free; 75 included live calls on the first paid Pro tier",
    fit: "AI receptionist buyers who prefer per call capacity and service backed tiers",
    href: "https://smith.ai/pricing/ai-receptionist",
    source: "Smith.ai pricing",
    internal: false,
  },
  {
    name: "Bland",
    price: "$0 platform · $0.14/min",
    usage: "Model and speech included; carrier costs separate; transfers $0.05/min",
    fit: "Developers who want API based voice with bundled model and speech costs",
    href: "https://www.bland.ai/pricing",
    source: "Bland pricing",
    internal: false,
  },
  {
    name: "Retell",
    price: "$0.07 to $0.31/min",
    usage: "Some direct speech models cost more; phone numbers and messaging are separate",
    fit: "Developers optimizing model, voice, telephony, and add on choices per deployment",
    href: "https://www.retellai.com/pricing",
    source: "Retell pricing",
    internal: false,
  },
] as const;

const TABLE_ROWS = [
  ["Answer calls during business hours", "Your Bot can handle routine coverage"],
  ["Research several websites", "Your Bot browses and brings back a summary"],
  ["Repeat the same details", "Your Bot keeps the instructions"],
  ["Receive another task", "You get a clear next step"],
  ["Miss after hours calls", "Your Bot can answer within the coverage rules you configure"],
  ["Train a new receptionist", "Your Bot starts with your playbook on day one"],
  [
    "Keep notes in separate tools",
    "Your Bot keeps the conversation, summary, and next step in one workspace",
  ],
  [
    "Follow up on every inbound lead",
    "Your Bot can qualify the lead and use enabled tools to book, hand off, or record the next step",
  ],
] as const;

export default function Compare() {
  const { billingModel } = usePaidPlanAvailability({ planId: "usage" });
  const marketOptions = MARKET_OPTIONS.map((option) =>
    option.internal && billingModel === "usage"
      ? {
          ...option,
          price: `From $${entryUsageTier.monthlyUsd}/month + usage`,
          usage: `$${entryUsageTier.includedWorkUsd} of shared work included across calls, SMS, email, and Computer. One phone number and email address included.`,
        }
      : option,
  );
  return (
    <MarketingPageFrame className="wl-compare-page">
      <PageMeta
        title="Why BotBound | Compare Bots"
        description="Compare BotBound's Bot workspace with flat subscriptions, usage pricing, and developer voice infrastructure."
        path="/compare"
      />

      <section className="marketing-section">
        <div className="mx-auto mb-8 max-w-6xl text-center">
          <h1 className="marketing-hero-title mx-auto">Find Your Fit</h1>
          <div className="marketing-hero__actions mt-7">
            <Link
              to="/signup"
              className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
            >
              Get Started
            </Link>
            <Link
              to="/pricing"
              className="marketing-btn-secondary min-h-11 px-5 text-sm font-semibold"
            >
              See Pricing
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full min-w-0 max-w-6xl">
          <h2 className="sr-only">Compare Pricing Models</h2>

          <div className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card lg:hidden">
            {marketOptions.map((option) => (
              <article
                key={option.name}
                className={`p-5 ${option.internal ? "bg-primary/[0.06]" : ""}`}
              >
                <h3 className="wl-preserve-case text-base font-semibold text-foreground">
                  {option.name}
                </h3>
                <p className="mt-1 text-base font-semibold text-foreground">{option.price}</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{option.usage}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{option.fit}</p>
                {option.internal ? (
                  <Link
                    className="wl-focus-ring-halo -ml-2 mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary"
                    to={option.href}
                  >
                    {option.source} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                ) : (
                  <a
                    className="wl-focus-ring-halo -ml-2 mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary"
                    href={option.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {option.source} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
              </article>
            ))}
          </div>

          <div className="mt-8 hidden w-full max-w-full overflow-x-auto border border-border bg-card lg:block">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <caption className="sr-only">
                Public launch pricing and buying model comparison for BotBound and selected
                alternatives
              </caption>
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  {["Option", "Public Entry Price", "Usage Boundary", "Best Fit", "Source"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-5 py-4 text-xs font-semibold tracking-[0.04em] text-muted-foreground"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {marketOptions.map((option, index) => (
                  <tr
                    className={
                      (index ? "border-t border-border " : "") +
                      (option.internal ? "bg-primary/[0.06]" : "bg-card")
                    }
                    key={option.name}
                  >
                    <th className="px-5 py-5 align-top text-sm font-semibold text-foreground">
                      {option.name}
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
                          className="wl-focus-ring-halo -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 font-medium text-primary"
                          to={option.href}
                        >
                          {option.source} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      ) : (
                        <a
                          className="wl-focus-ring-halo -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 font-medium text-primary"
                          href={option.href}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {option.source}{" "}
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 max-w-4xl text-xs leading-5 text-muted-foreground">
            Public prices were checked on the linked official pages on October 11, 2026 and may
            change. Taxes, carrier fees, optional extras, annual discounts, implementation services,
            and usage patterns can change the effective total. This is a buying model reference, not
            a claim that unlike products are feature by feature equivalents.
          </p>
          <details className="group mt-8 border-t border-border">
            <summary className="wl-focus-ring-halo flex min-h-11 max-w-none cursor-pointer list-none items-center justify-between gap-3 rounded-md py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              Why BotBound
              <ChevronDown
                className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="grid gap-6 pb-2 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {DIFFERENCES.map(({ title, copy }) => (
                <article key={title}>
                  <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
                </article>
              ))}
            </div>
          </details>
        </div>
      </section>

      <section className="marketing-section border-t border-border bg-card">
        <div className="mx-auto grid max-w-4xl gap-8">
          <div className="text-center">
            <h2 className="wl-stitch-display text-balance">
              The Routine Call Should Not Become a Project
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

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/signup" className="font-semibold text-primary hover:underline">
              Get Started
            </Link>{" "}
            and build one before you compare another.
          </p>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
