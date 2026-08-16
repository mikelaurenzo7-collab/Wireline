import { useEffect } from "react";
import { Link } from "react-router";
import { ArrowRight, Phone, Volume2 } from "lucide-react";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import MarketingHero from "../components/marketing/MarketingHero";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

export default function Showcase() {
  const primaryDemo = LANDING_PUBLIC_DEMO_AGENTS[0];

  useEffect(() => {
    captureDemoSourceFromLocation();
  }, []);

  return (
    <MarketingPageFrame>
      <PageMeta
        title="Try Wireline"
        description="Hear the voice agent your customers will meet first, then build one for voice, SMS, and email."
        path="/showcase"
      />

      <MarketingHero
        title="Hear what your customer hears."
        primaryAction={{ label: "Create an Agent", to: "/signup" }}
        secondaryAction={{
          label: "Call a demo line",
          to: "#demo-lines",
          tone: "secondary",
        }}
        visual={
          <div className="flex flex-col justify-between text-center lg:min-h-[19rem]">
            <div>
              <div className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
                <Volume2 className="h-4 w-4 text-primary" aria-hidden="true" />
                Live browser preview
              </div>
            </div>
            <div className="mt-5 rounded-[16px] border border-border bg-background/70 p-4 lg:mt-8">
              <BrowserCallWidget
                agentName={primaryDemo.name}
                buttonLabel="Start live demo"
                fallback={
                  <div className="text-center">
                    <a
                      href={`tel:${primaryDemo.tel}`}
                      className="marketing-btn-secondary inline-flex min-h-11 justify-center px-5 text-[15px] font-semibold"
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

      <section id="demo-lines" className="marketing-section border-b border-border bg-card">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="wl-stitch-display text-balance">Call a live demo line.</h2>
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

      <section className="marketing-section mx-auto max-w-6xl">
        <div className="wl-stitch-card wl-stitch-card-brand p-7 sm:p-10">
          <div className="grid justify-items-center gap-7 text-center">
            <div>
              <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-[-.04em] sm:text-4xl">
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
