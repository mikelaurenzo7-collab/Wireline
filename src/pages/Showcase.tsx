import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
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
        description="Hear the Phone Bot in a protected browser preview. Then build one for calls, email, text, and the work that should happen next."
        path="/showcase"
      />

      <section className="marketing-section marketing-section--screen min-w-0">
        <MarketingHero
          title="HEAR WHAT YOUR CUSTOMER HEARS"
          primaryAction={{ label: "BUILD YOUR BOT", to: FREE_SIGNUP }}
          visual={
            <div className="flex flex-col gap-3 text-center">
              <div className="text-sm font-semibold text-foreground">PROTECTED BROWSER PREVIEW</div>
              <div className="rounded-[16px] border border-border bg-background/70 p-3">
                <BrowserCallWidget
                  agentName={primaryDemo.name}
                  buttonLabel={`Talk to ${primaryDemo.name}`}
                  fallback={
                    <div className="text-center">
                      <a
                        href={FREE_SIGNUP}
                        className="marketing-btn-secondary inline-flex min-h-11 items-center justify-center gap-1.5 px-5 text-[15px] font-semibold"
                      >
                        BUILD YOUR BOT
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  }
                />
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                No account or phone number required. Microphone access starts only when you begin the preview.
              </p>
            </div>
          }
        />
      </section>
    </MarketingPageFrame>
  );
}
