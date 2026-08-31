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
        description="Talk to a BotBound Phone Bot in a protected browser preview, then build your own Bot for calls, email, text, and follow-up work."
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

        <section id="browser-demos" className="mt-8 min-w-0" aria-labelledby="browser-demos-title">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="browser-demos-title" className="text-2xl font-semibold tracking-[-.035em] text-foreground">
              Try both call flows
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Protected browser demos use OpenAI Realtime and require no account or phone call.
            </p>
          </div>
          <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
            {LANDING_PUBLIC_DEMO_AGENTS.map((agent) => (
              <article key={agent.name} className="wl-stitch-card min-w-0 p-5 text-center">
                <h3 className="text-[15px] font-semibold tracking-[-.015em] text-foreground">
                  {agent.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{agent.role}</p>
                <div className="mt-5">
                  <BrowserCallWidget
                    agentName={agent.name}
                    buttonLabel={`Talk to ${agent.name}`}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </MarketingPageFrame>
  );
}
