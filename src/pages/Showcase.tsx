import { useEffect } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, Phone, Volume2 } from "lucide-react";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import MarketingHero from "../components/marketing/MarketingHero";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const SHOWCASE_HERO_PROOF = [
  "Live in your browser",
  "Real phone demos",
  "No signup to listen",
] as const;

export default function Showcase() {
  const primaryDemo = LANDING_PUBLIC_DEMO_AGENTS[0];

  useEffect(() => {
    captureDemoSourceFromLocation();
  }, []);

  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-16">
      <PageMeta
        title="Try Wireline"
        description="Hear the voice agent your customers will meet first, then build one for voice, SMS, and email."
        path="/showcase"
      />

      <MarketingHero
        eyebrow="Try Wireline"
        title="Hear what your customer hears."
        primaryAction={{ label: "Create an agent", to: "/signup" }}
        secondaryAction={{ label: "Call a demo line", to: "#demo-lines", tone: "secondary" }}
        proof={SHOWCASE_HERO_PROOF}
        visual={
          <div className="flex min-h-[19rem] flex-col justify-between text-center">
            <div>
              <div className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
                <Volume2 className="h-4 w-4 text-primary" aria-hidden="true" />
                Live browser preview
              </div>
              <h2 className="mx-auto mt-5 max-w-[18ch] font-[var(--wireline-font-family-display)] text-[clamp(2rem,3.4vw,3.35rem)] font-semibold leading-[1] tracking-[-.04em] text-foreground">
                Ask normally. Hear the result.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                Your microphone turns on only after you start.
              </p>
            </div>
            <div className="mt-8 rounded-[16px] border border-border bg-background/70 p-4">
              <BrowserCallWidget
                agentName={primaryDemo.name}
                buttonLabel="Start live demo"
                fallback={
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      Prefer the phone? Call a live demo line. No signup to listen.
                    </p>
                    <a
                      href={`tel:${primaryDemo.tel}`}
                      className="marketing-btn-secondary mt-3 inline-flex min-h-11 justify-center px-5 text-[15px] font-semibold"
                    >
                      Call {primaryDemo.display}
                    </a>
                  </div>
                }
              />
            </div>
          </div>
        }
      />

      <section
        id="demo-lines"
        className="border-b border-border bg-card px-5 py-14 sm:px-8 sm:py-20"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="wl-stitch-eyebrow">Prefer the phone?</p>
            <h2 className="wl-stitch-display mt-3 text-balance">Call a live demo line.</h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Hear inbound service or outbound sales without creating an account.
            </p>
          </div>

          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            {LANDING_PUBLIC_DEMO_AGENTS.map((agent) => (
              <a
                key={agent.tel}
                href={`tel:${agent.tel}`}
                className="group wl-stitch-card wl-stitch-card-hover p-6 text-center sm:p-7"
              >
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary/8 text-primary">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-[-.025em] text-foreground">
                  {agent.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{agent.role}</p>
                <p className="mt-4 font-mono text-sm font-semibold text-foreground">
                  {agent.display}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Call now
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16 lg:px-10">
        <div className="wl-stitch-card wl-stitch-card-brand p-7 sm:p-10">
          <div className="grid justify-items-center gap-7 text-center">
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--wireline-color-text-secondary)]">
                <Check className="h-4 w-4" aria-hidden="true" />
                Build and test privately.
              </span>
              <h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-[-.04em] sm:text-4xl">
                Ready to train your own?
              </h2>
            </div>
            <Link
              to="/signup"
              className="marketing-btn-primary min-h-12 px-6 text-sm font-semibold"
            >
              Create an agent <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
