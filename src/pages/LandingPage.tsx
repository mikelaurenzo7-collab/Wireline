import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, type MotionProps } from "motion/react";
import { ArrowRight, CheckCircle2, Clock3, PhoneCall, ShieldCheck } from "lucide-react";

import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const REVEAL: MotionProps = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
};

const PRODUCT_POINTS = [
  {
    icon: PhoneCall,
    title: "Answer every call",
    body: "Give every lead a live-sounding voice agent that can qualify, route, book, and follow up.",
  },
  {
    icon: Clock3,
    title: "Launch quickly",
    body: "Start with a real phone number, a role, and a script. Refine behavior from Agent Studio.",
  },
  {
    icon: ShieldCheck,
    title: "Stay in control",
    body: "Review calls, adjust training, and keep escalation rules clear before customers hit dead ends.",
  },
] as const;

export default function LandingPage() {
  const csDemo =
    LANDING_PUBLIC_DEMO_AGENTS.find((agent) => agent.name === "Jordan") ||
    LANDING_PUBLIC_DEMO_AGENTS[0];

  useEffect(() => {
    captureSignupIntentFromLocation();
    captureDemoSourceFromLocation();
  }, []);

  return (
    <>
      <PageMeta
        title="Wireline | AI Voice Agents for Business"
        description="Deploy AI voice agents that answer calls, qualify leads, book appointments, and follow up from one simple workspace."
        image="/og-image.jpg"
      />

      <div className="marketing-launch min-h-screen bg-card font-sans text-foreground selection:bg-primary/20 selection:text-foreground overflow-x-hidden">
        <PublicSiteHeader active="home" />

        <main
          id="main-content"
          className="relative mx-auto max-w-7xl space-y-24 px-5 pb-24 pt-36 sm:px-6 sm:pt-40 md:px-12"
        >
          <section className="relative z-10 grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <motion.div {...REVEAL} className="mx-auto max-w-3xl text-center lg:mx-0 lg:text-left">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/8 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
                <span className="h-2 w-2 rounded-full bg-brand" />
                Live agent platform
              </div>

              <h1 className="font-display text-[clamp(3rem,8vw,6rem)] leading-[0.98] tracking-[-0.045em] text-foreground text-balance">
                AI voice agents that pick up the phone.
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-foreground/70 lg:mx-0">
                Wireline gives businesses a simple way to deploy phone agents that answer, qualify,
                book, escalate, and send follow-ups without sounding like a menu tree.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link
                  to="/signup"
                  className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-md bg-brand px-7 text-sm font-semibold text-white shadow-[0_18px_50px_-28px_rgba(139,63,214,0.9)] transition hover:bg-brand-deep"
                >
                  Start free trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/showcase"
                  className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-md border border-ink/12 bg-card px-7 text-sm font-semibold text-foreground transition hover:border-brand/30 hover:bg-card-warm/50"
                >
                  Call a demo agent
                  <PhoneCall className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-foreground/62 lg:justify-start">
                {["Real phone numbers", "Agent Studio included", "Call logs and coaching"].map(
                  (item) => (
                    <span key={item} className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-brand" />
                      {item}
                    </span>
                  ),
                )}
              </div>
            </motion.div>

            <motion.div
              {...REVEAL}
              transition={{ ...REVEAL.transition, delay: 0.08 }}
              className="mx-auto w-full max-w-xl"
            >
              <div className="rounded-md border border-ink/10 bg-card shadow-[0_24px_80px_-56px_rgba(26,22,20,0.55)]">
                <div className="border-b border-ink/10 px-5 py-4">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
                    Try it in browser
                  </p>
                  <p className="mt-1 text-sm text-foreground/62">
                    Talk to a live Wireline demo agent before creating an account.
                  </p>
                </div>
                <div className="p-5 sm:p-6">
                  <BrowserCallWidget agentName={csDemo.name} />
                </div>
              </div>
            </motion.div>
          </section>

          <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {PRODUCT_POINTS.map(({ icon: Icon, title, body }) => (
              <motion.article
                key={title}
                {...REVEAL}
                className="rounded-md border border-ink/10 bg-card p-6 shadow-[0_18px_48px_-42px_rgba(26,22,20,0.55)]"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md border border-brand/15 bg-brand/8 text-brand">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="font-display text-2xl italic text-foreground">{title}</h2>
                <p className="mt-3 text-sm leading-7 text-foreground/66">{body}</p>
              </motion.article>
            ))}
          </section>

          <section className="rounded-md border border-ink/10 bg-card-warm/25 px-6 py-10 text-center">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
              Works with the tools your team already uses
            </p>
            <div className="mt-8 opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0">
              <IntegrationLogos />
            </div>
          </section>
        </main>

        <footer className="border-t border-ink/10 bg-card px-5 py-10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-foreground/55 md:flex-row">
            <div>© {new Date().getFullYear()} Wireline</div>
            <div className="flex gap-6">
              <Link className="hover:text-brand" to="/terms">
                Terms
              </Link>
              <Link className="hover:text-brand" to="/privacy">
                Privacy
              </Link>
              <Link className="hover:text-brand" to="/status">
                Status
              </Link>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand" />
              Systems online
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
