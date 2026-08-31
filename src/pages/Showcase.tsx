import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { PageMeta } from "../lib/page-meta";
import { signupHrefForPlan } from "../lib/signup-intent";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import MarketingHero from "../components/marketing/MarketingHero";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const FREE_SIGNUP = signupHrefForPlan("personal");
const DEFAULT_SHOWCASE_DEMO = LANDING_PUBLIC_DEMO_AGENTS[0]!;

export default function Showcase() {
  const [activeDemo, setActiveDemo] = useState(DEFAULT_SHOWCASE_DEMO);

  useEffect(() => {
    captureDemoSourceFromLocation();
  }, []);

  return (
    <MarketingPageFrame className="wl-showcase-page">
      <PageMeta
        title="TRY BOTBOUND | HEAR A PHONE BOT"
        description="Hear the Phone Bot in a protected browser preview. Then build one for calls, email, text, and the work that should happen next."
        path="/showcase"
      />

      <section className="marketing-section marketing-section--screen min-w-0">
        <MarketingHero
          title="HEAR WHAT YOUR CUSTOMER HEARS"
          primaryAction={{ label: "BUILD YOUR BOT", to: FREE_SIGNUP }}
          visual={
            <div
              id="showcase-preview"
              className="mx-auto flex w-full max-w-md flex-col items-center gap-5 text-center"
            >
              <p className="wl-eyebrow">Protected browser preview</p>
              <div
                className="wl-segmented grid w-full max-w-[22rem] grid-cols-2"
                role="tablist"
                aria-label="Demo Phone Bots"
              >
                {LANDING_PUBLIC_DEMO_AGENTS.map((agent) => {
                  const selected = agent.name === activeDemo.name;
                  return (
                    <button
                      key={agent.name}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className="wl-segmented__item flex-1"
                      onClick={() => setActiveDemo(agent)}
                    >
                      {agent.name}
                    </button>
                  );
                })}
              </div>
              <p className="wl-preserve-case text-sm leading-6 text-muted-foreground">
                {activeDemo.role}
              </p>
              <BrowserCallWidget
                key={activeDemo.name}
                agentName={activeDemo.name}
                buttonLabel={`Talk to ${activeDemo.name}`}
                fallback={
                  <a
                    href={FREE_SIGNUP}
                    className="marketing-btn-secondary inline-flex min-h-11 items-center justify-center gap-1.5 px-5 text-[15px] font-semibold"
                  >
                    BUILD YOUR BOT
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                }
              />
              <p className="wl-showcase-preview__note max-w-[36ch] text-xs leading-5 text-muted-foreground">
                No account or phone number required. Microphone access starts only when you begin
                the preview.
              </p>
            </div>
          }
        />
      </section>
    </MarketingPageFrame>
  );
}
