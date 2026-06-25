import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, MessageSquare, Phone, Volume2 } from "lucide-react";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const STEPS = [
  ["Try it", "Start a private browser conversation."],
  ["Ask normally", "Say what you need help with."],
  ["Hear the result", "Get a feel for how Wireline listens, responds, and moves to the next step."],
] as const;

export default function Showcase() {
  const primaryDemo = LANDING_PUBLIC_DEMO_AGENTS[0];

  useEffect(() => {
    captureDemoSourceFromLocation();
  }, []);

  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta
        title="Try Wireline"
        description="Hear the AI call assistant your customers will meet first, then build a Wireline agent for voice, email, and SMS."
        path="/showcase"
      />

      <section className="mx-auto max-w-6xl px-5 pb-14 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:px-10">
        <div className="max-w-3xl">
          <p className="wl-stitch-eyebrow">Try Wireline</p>
          <h1 className="wl-stitch-marketing-hero mt-4 text-balance">
            Hear the assistant your customer meets first.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
            Try a short browser conversation. Your agent's specific brief and rules carry across
            voice, email, and SMS.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
          <section className="wl-stitch-card p-2">
            <div className="flex min-h-[300px] flex-col justify-between border border-border bg-muted/30 p-6 sm:p-8">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Volume2 className="h-4 w-4 text-primary" />
                  Live browser preview
                </div>
                <h2 className="wl-stitch-display mt-5 text-balance">Talk to an assistant.</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                  Ask a simple question, describe a task, or just say hello. Your microphone only
                  turns on after you choose to start.
                </p>
              </div>
              <div className="mt-10">
                <BrowserCallWidget agentName={primaryDemo.name} />
              </div>
            </div>
          </section>

          <aside className="wl-stitch-card p-6 sm:p-8">
            <p className="wl-stitch-label">What to expect</p>
            <ol className="mt-6 space-y-5">
              {STEPS.map(([title, copy], index) => (
                <li className="flex gap-4" key={title}>
                  <span className="grid h-7 w-7 flex-none place-items-center rounded bg-muted text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span>
                    <strong className="block text-sm font-semibold text-foreground">{title}</strong>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                      {copy}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-9 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
              A demo is only the first impression. In Studio, you set the job, policies, connected
              actions, and handoff limits.
            </p>
          </aside>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:items-end">
            <div>
              <p className="wl-stitch-eyebrow">More examples</p>
              <h2 className="wl-stitch-display mt-3 text-balance">Call a demo line.</h2>
              <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
                These are role-play examples. They never route you to a real business or person.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {LANDING_PUBLIC_DEMO_AGENTS.map((agent) => (
                <a
                  key={agent.tel}
                  href={`tel:${agent.tel}`}
                  className="group wl-stitch-card wl-stitch-card-hover p-5"
                >
                  <div className="flex items-start justify-between gap-4">
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
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="wl-stitch-card border-primary bg-primary p-7 text-primary-foreground sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-primary-foreground/75">
                <Check className="h-4 w-4" />
                Your assistant starts as a private draft.
              </div>
              <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
                Ready to put the next conversation in motion?
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-primary-foreground/75 sm:text-base">
                Build one assistant for your life or a business agent for lead response, scheduling,
                and customer coverage—then refine it from a real conversation.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-none">
              <Link
                to="/pricing"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded bg-white px-5 text-sm font-semibold text-primary"
              >
                See plans <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/signup"
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded border border-white/35 bg-transparent px-5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Create account <MessageSquare className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
