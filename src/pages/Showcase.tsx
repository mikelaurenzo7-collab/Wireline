import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Phone, Volume2 } from "lucide-react";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import AgentPresenterStage from "../components/marketing/AgentPresenterStage";
import MarketingHero from "../components/marketing/MarketingHero";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const STEPS = ["Start", "Ask normally", "Get the result"] as const;
const SHOWCASE_HERO_PROOF = ["Live browser preview", "Demo lines", "Private by default"] as const;

export default function Showcase() {
  const primaryDemo = LANDING_PUBLIC_DEMO_AGENTS[0];
  useEffect(() => {
    captureDemoSourceFromLocation();
  }, []);

  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-16">
      <PageMeta
        title="Try Wireline"
        description="Hear the AI agent your customers will meet first, then build an agent for voice, email, and text."
        path="/showcase"
      />

      <MarketingHero
        eyebrow="Try Wireline"
        title="Hear the agent your customer meets first."
        description="A live example of the voice-first operation: start the preview, ask normally, and see how a trained agent turns the conversation into a result."
        primaryAction={{ label: "Create agent", to: "/signup" }}
        secondaryAction={{ label: "Call a demo line", to: "#demo-lines", tone: "secondary" }}
        proof={SHOWCASE_HERO_PROOF}
        visual={
          <div className="flex min-h-[22rem] flex-col justify-between text-center">
            <div>
              <div className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
                <Volume2 className="h-4 w-4 text-primary" />
                Live browser preview
              </div>
              <h2 className="mt-5 font-[var(--wireline-font-family-display)] text-[clamp(2rem,3.4vw,3.35rem)] font-normal leading-[.98] tracking-[-.045em] text-foreground">
                Talk to an agent.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                Your microphone turns on only after you start.
              </p>
            </div>
            <div className="mt-8 rounded-[16px] border border-border bg-background/70 p-4">
              <BrowserCallWidget agentName={primaryDemo.name} buttonLabel="Start live demo" />
            </div>
          </div>
        }
      />

      <section className="border-b border-border px-5 py-12 sm:px-8 sm:py-16 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="wl-stitch-eyebrow">What happens</p>
            <h2 className="wl-stitch-display mt-3 text-balance">Three steps. No maze.</h2>
          </div>
          <ol className="mt-9 grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step} className="wl-stitch-card p-6 text-center">
                <span className="mx-auto grid h-9 w-9 place-items-center rounded bg-muted font-mono text-xs font-semibold text-primary">
                  0{index + 1}
                </span>
                <strong className="mt-5 block text-sm font-semibold text-foreground">{step}</strong>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <AgentPresenterStage />
      </section>

      <section id="demo-lines" className="border-y border-border bg-card px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:items-end">
          <div className="mx-auto max-w-2xl text-center">
            <p className="wl-stitch-eyebrow">More examples</p>
            <h2 className="wl-stitch-display mt-3 text-balance">Call a demo line.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {LANDING_PUBLIC_DEMO_AGENTS.map((agent) => (
              <a
                key={agent.tel}
                href={`tel:${agent.tel}`}
                className="group wl-stitch-card wl-stitch-card-hover p-5 text-center"
              >
                <div className="flex items-start justify-center gap-4">
                  <span className="grid h-9 w-9 place-items-center rounded bg-muted text-primary">
                    <Phone className="h-4 w-4" />
                  </span>
                  <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <h3 className="mt-6 text-lg font-semibold tracking-[-.025em] text-foreground">
                  {agent.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{agent.role}</p>
                <p className="mt-4 font-mono text-sm font-semibold text-foreground">
                  {agent.display}
                </p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="wl-stitch-card wl-stitch-card-brand p-7 sm:p-10">
          <div className="grid justify-items-center gap-7 text-center">
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--wireline-color-text-secondary)]">
                <Check className="h-4 w-4" />
                Your agent starts private.
              </span>
              <h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
                Ready for the next conversation?
              </h2>
            </div>
            <Link
              to="/signup"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded bg-[var(--wireline-color-text-primary)] px-5 text-sm font-semibold text-[var(--wireline-color-canvas-default)]"
            >
              Create agent <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
