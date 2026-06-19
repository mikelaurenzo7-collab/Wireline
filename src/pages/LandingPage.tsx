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

      <div className="marketing-launch min-h-screen bg-marketing-surface font-sans text-foreground selection:bg-iris/20 selection:text-foreground overflow-x-hidden">
        <PublicSiteHeader active="home" />

        <main id="main-content" className="relative mx-auto max-w-6xl space-y-24 px-6 pb-24 pt-24 sm:pt-28 md:px-10">
          {/* ═══════════════════════════════════════════════════════════════
               GROK-FLAIR SIGNATURE HERO — Editorial, Spacious, Flawless
               One powerful promise. One clear action. A live wire motif.
          ═══════════════════════════════════════════════════════════════ */}
          <section className="relative pt-12 pb-8">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-iris/20 bg-iris/5 px-4 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-iris">
                <span className="h-px w-3 bg-iris/60" /> LIVE ON THE WIRE
              </div>

              <h1 className="font-display text-[72px] leading-[0.96] tracking-[-0.052em] text-balance sm:text-[88px] md:text-[104px]">
                Your phone.<br />Finally answering for you.
              </h1>

              <p className="mx-auto mt-8 max-w-[46ch] text-2xl tracking-[-0.012em] text-foreground/75">
                Wireline deploys calm, intelligent voice agents that answer, qualify, book, and follow up — so every call feels handled.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  to="/signup"
                  className="inline-flex h-14 items-center justify-center gap-3 rounded-2xl bg-foreground px-10 text-base font-semibold text-marketing-surface transition-all hover:bg-iris hover:text-white active:scale-[0.985]"
                >
                  Start free trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/showcase"
                  className="inline-flex h-14 items-center justify-center gap-3 rounded-2xl border border-foreground/15 px-9 text-base font-medium text-foreground transition hover:border-iris/40 hover:text-iris"
                >
                  See it in action
                </Link>
              </div>

              <div className="mt-9 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-foreground/50">
                {["No call-center contracts", "Real phone numbers", "Studio + Training included"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-iris" /> {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Subtle live-wire motif (editorial accent) */}
            <div className="pointer-events-none absolute -bottom-8 left-1/2 hidden h-px w-[620px] -translate-x-1/2 bg-gradient-to-r from-transparent via-iris/30 to-transparent md:block" />
          </section>

          {/* ═══════════════════════════════════════════════════════════════
               Narrative proof — not a feature grid
          ═══════════════════════════════════════════════════════════════ */}
          <section className="mx-auto max-w-3xl text-center pt-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-iris/70">WHY IT MATTERS</div>
            <p className="mt-4 text-[21px] leading-tight tracking-[-0.01em] text-foreground/80">
              The phone is still where deals close, jobs get booked, and customers decide to stay.<br />Most calls go to voicemail. Wireline makes sure every one gets a great answer.
            </p>
          </section>

          {/* Demo widget — now secondary, generous breathing room */}
          <section className="mx-auto max-w-[820px] pt-6">
            <div className="rounded-3xl border border-border bg-white p-2 shadow-xl shadow-black/5">
              <div className="rounded-[22px] border border-border/60 bg-marketing-surface-2 px-8 py-8">
                <div className="flex items-center justify-between pb-5">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-iris">LIVE IN YOUR BROWSER</div>
                    <div className="font-display text-3xl tracking-[-0.02em]">Talk to a real Wireline agent</div>
                  </div>
                  <div className="hidden text-right text-xs text-foreground/50 md:block">No account required</div>
                </div>
                <BrowserCallWidget agentName={csDemo.name} />
              </div>
            </div>
          </section>

          {/* Quiet integration endorsement */}
          <section className="pt-12 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/40 mb-5">Already works with the tools you trust</div>
            <div className="opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0">
              <IntegrationLogos />
            </div>
          </section>
        </main>

        <footer className="border-t border-border/60 bg-marketing-surface px-6 py-12 text-sm text-foreground/50">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 md:flex-row">
            <div>© {new Date().getFullYear()} Wireline</div>
            <div className="flex gap-8">
              <Link className="hover:text-foreground" to="/terms">Terms</Link>
              <Link className="hover:text-foreground" to="/privacy">Privacy</Link>
              <Link className="hover:text-foreground" to="/status">Status</Link>
            </div>
            <div className="inline-flex items-center gap-2 text-xs tracking-[0.14em] uppercase">
              <span className="h-px w-4 bg-foreground/30" /> Systems online
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
