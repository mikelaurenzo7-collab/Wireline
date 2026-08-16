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
    copy: "No reseller in the middle, and no account manager between you and the people who build it. Support goes to the same inbox we read.",
  },
  {
    heading: "Trained, Not Templated",
    copy: "An agent learns your tone, your scripts, and your service knowledge. It does not ship as a generic script you edit around.",
  },
  {
    heading: "Under Your Control",
    copy: "Calling-hour rules, Do Not Call checks, and opt-outs are enforced in the runtime — before a dial, not after a complaint.",
  },
  {
    heading: "One Record",
    copy: "The call, the follow-up text, the email, and the outcome stay on one thread. Nothing is finished until it is written down.",
  },
] as const;

/**
 * About — a statement page, not a second landing page.
 *
 * It used to open with a headline and two buttons in an otherwise empty
 * viewport, then show three benefit cards and close with a "Build your voice
 * agent" band: the landing page's shape, the landing page's vocabulary, and the
 * landing page's call to action, four screens long, on the page a visitor opens
 * precisely because they want something *other* than the pitch.
 *
 * So this one is built to be unmistakable at a glance. It is left-aligned where
 * every other public page is centred, it is a numbered column rather than a card
 * grid, and it has no primary CTA — the header carries Start Free on every route
 * already. What it offers instead is the thing an About page owes a buyer: a
 * position, and a way to reach a person.
 */
export default function About() {
  return (
    <MarketingPageFrame className="wl-about-page">
      <PageMeta
        title="About Wireline | Voice Agents for Calls and Follow up"
        description="Wireline is an independent voice agent platform. How we build, what we enforce in the runtime, and how to reach the people who make it."
        path="/about"
      />

      <section className="marketing-section marketing-section--screen">
        <div className="wl-public-rail grid gap-10 !text-left lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <p className="wl-eyebrow wl-eyebrow--wired text-primary">About</p>
            <h1 className="marketing-hero-title mt-4 max-w-[16ch] text-[clamp(1.9rem,3.4vw,2.9rem)]">
              Built by the people who answer the support email
            </h1>
            <WireSignalArt className="mt-8 h-12 max-w-sm" />
            <a
              href="mailto:support@trywireline.com"
              className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              support@trywireline.com
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
