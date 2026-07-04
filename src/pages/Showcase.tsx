import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Phone, Volume2 } from "lucide-react";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const STEPS = ["Start", "Ask normally", "Get the result"] as const;

export default function Showcase() {
  const primaryDemo = LANDING_PUBLIC_DEMO_AGENTS[0];
  useEffect(() => {
    captureDemoSourceFromLocation();
  }, []);

  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta
        title="Try Wireline"
        description="Hear the AI agent your customers will meet first, then build an agent for voice, email, and text."
        path="/showcase"
      />

      <section className="mx-auto max-w-6xl px-5 pb-14 pt-14 text-center sm:px-8 sm:pb-20 sm:pt-20 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <p className="wl-stitch-eyebrow">Try Wireline</p>
          <h1 className="wl-stitch-marketing-hero mt-4 text-balance">
            Hear the agent your customer meets first.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">
            A live example. Real conversation.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
          <section className="wl-stitch-card p-2">
            <div className="flex min-h-[300px] flex-col items-center justify-between border border-border bg-muted/30 p-6 text-center sm:p-8">
              <div>
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Volume2 className="h-4 w-4 text-primary" />
                  Live browser preview
                </div>
                <h2 className="wl-stitch-display mt-5 text-balance">Talk to an agent.</h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                  Your microphone turns on only after you start.
                </p>
              </div>
              <div className="mt-10">
                <BrowserCallWidget agentName={primaryDemo.name} buttonLabel="Start live demo" />
              </div>
            </div>
          </section>

          <aside className="wl-stitch-card p-6 sm:p-8">
            <p className="wl-stitch-label">What happens</p>
            <ol className="mt-6 space-y-5">
              {STEPS.map((step, index) => (
                <li className="flex items-center gap-4" key={step}>
                  <span className="grid h-7 w-7 flex-none place-items-center rounded bg-muted text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <strong className="text-sm font-semibold text-foreground">{step}</strong>
                </li>
              ))}
            </ol>
            <p className="mt-9 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
              In Studio, you shape the job, voice, and handoff.
            </p>
          </aside>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-14 sm:px-8 sm:py-20">
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
                className="group wl-stitch-card wl-stitch-card-hover p-5"
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
              <span className="inline-flex items-center gap-2 text-sm font-medium text-primary-foreground/75">
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
