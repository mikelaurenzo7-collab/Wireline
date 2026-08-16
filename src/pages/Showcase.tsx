import { useEffect } from "react";
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
        title="Hear what your customer hears"
        primaryAction={{ label: "Create an Agent", to: "/signup" }}
        secondaryAction={{
          label: "Call a demo line",
          to: "#demo-lines",
          tone: "secondary",
        }}
        visual={
          <div className="flex flex-col gap-5 text-center">
            <div>
              <div className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
                <Volume2 className="h-4 w-4 text-primary" aria-hidden="true" />
                Live browser preview
              </div>
            </div>
            <div className="rounded-[16px] border border-border bg-background/70 p-4">
              <BrowserCallWidget
                agentName={primaryDemo.name}
                buttonLabel="Start live demo"
                fallback={
                  <div className="text-center">
                    <a
                      href="#demo-lines"
                      className="marketing-btn-secondary inline-flex min-h-11 justify-center px-5 text-[15px] font-semibold"
                    >
                      Call a Demo Line
                    </a>
                  </div>
                }
              />
            </div>
          </div>
        }
      />

      <section id="demo-lines" className="marketing-section marketing-section--tight">
        <div className="mx-auto max-w-6xl text-center">
          {/* A label, not a second headline: one screen carries one. */}
          <p className="wl-eyebrow mx-auto text-center text-muted-foreground">
            Or call a live demo line
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {LANDING_PUBLIC_DEMO_AGENTS.map((agent) => (
              <a
                key={agent.tel}
                href={`tel:${agent.tel}`}
                className="group wl-stitch-card wl-stitch-card-hover flex items-center gap-4 p-4 text-left"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/8 text-primary">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold tracking-[-.015em] text-foreground">
                    {agent.name}
                  </span>
                  <span className="block text-sm text-muted-foreground">{agent.role}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-semibold text-foreground">
                    {agent.display}
                  </span>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    Call Now
                    <ArrowRight
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
