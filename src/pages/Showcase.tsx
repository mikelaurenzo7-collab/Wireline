import { useEffect } from "react";
import { ArrowRight, Phone } from "lucide-react";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { PageMeta } from "../lib/page-meta";
import { signupHrefForPlan } from "../lib/signup-intent";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import MarketingHero from "../components/marketing/MarketingHero";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const FREE_SIGNUP = signupHrefForPlan("personal");

export default function Showcase() {
  const primaryDemo = LANDING_PUBLIC_DEMO_AGENTS[0];

  useEffect(() => {
    captureDemoSourceFromLocation();
  }, []);

  return (
    <MarketingPageFrame className="wl-showcase-page">
      <PageMeta
        title="TRY BOTBOUND | HEAR A PHONE BOT"
        description="Hear the Phone Bot first. Then build one for calls, email, text, and the work that should happen next."
        path="/showcase"
      />

      <section className="marketing-section marketing-section--screen min-w-0">
        <MarketingHero
          title="HEAR WHAT YOUR CUSTOMER HEARS"
          primaryAction={{ label: "BUILD YOUR BOT", to: FREE_SIGNUP }}
          visual={
            <div className="flex flex-col gap-3 text-center">
              <div className="text-sm font-semibold text-foreground">LIVE PHONE PREVIEW</div>
              <div className="rounded-[16px] border border-border bg-background/70 p-3">
                <BrowserCallWidget
                  agentName={primaryDemo.name}
                  buttonLabel={`Talk to ${primaryDemo.name}`}
                  fallback={
                    <div className="text-center">
                      <a
                        href="#demo-lines"
                        className="marketing-btn-secondary inline-flex min-h-11 justify-center px-5 text-[15px] font-semibold"
                      >
                        CALL A DEMO LINE
                      </a>
                    </div>
                  }
                />
              </div>
            </div>
          }
        />

        <section id="demo-lines" className="mt-8 min-w-0">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {LANDING_PUBLIC_DEMO_AGENTS.map((agent) => (
              <a
                key={agent.tel}
                href={`tel:${agent.tel}`}
                className="group wl-stitch-card wl-stitch-card-hover grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 p-2.5 text-left sm:flex sm:gap-3"
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
                <span className="col-start-2 min-w-0 text-left sm:col-auto sm:shrink-0 sm:text-right">
                  <span className="block break-words font-mono text-sm font-semibold text-foreground">
                    {agent.display}
                  </span>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    CALL NOW
                    <ArrowRight
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </span>
              </a>
            ))}
          </div>
        </section>
      </section>
    </MarketingPageFrame>
  );
}
