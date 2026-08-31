import { useEffect } from "react";
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
              <div className="text-sm font-semibold text-foreground">LIVE BROWSER PREVIEW</div>
              <div className="rounded-[16px] border border-border bg-background/70 p-3">
                <BrowserCallWidget
                  agentName={primaryDemo.name}
                  buttonLabel={`Talk to ${primaryDemo.name}`}
                />
              </div>
            </div>
          }
        />

        <section id="demo-lines" className="mt-8 min-w-0">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LANDING_PUBLIC_DEMO_AGENTS.map((agent) => (
              <div key={agent.name} className="wl-stitch-card min-w-0 p-4 text-center">
                <div className="text-[15px] font-semibold tracking-[-.015em] text-foreground">
                  {agent.name}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{agent.role}</div>
                <div className="mt-4">
                  <BrowserCallWidget
                    agentName={agent.name}
                    buttonLabel={`Talk to ${agent.name}`}
                    variant="compact"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </MarketingPageFrame>
  );
}
