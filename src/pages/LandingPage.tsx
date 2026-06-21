import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Brain, CheckCircle2, Lock, MessageSquare, PhoneCall, Radio } from "lucide-react";

import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import LandingIntegrationStrip from "../components/marketing/LandingIntegrationStrip";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const PROOF_POINTS = ["Calls for you", "Waits on hold", "Texts the answer"] as const;

export default function LandingPage() {
  const csDemo = LANDING_PUBLIC_DEMO_AGENTS.find((agent) => agent.name === "Jordan") || LANDING_PUBLIC_DEMO_AGENTS[0];

  useEffect(() => {
    captureSignupIntentFromLocation();
    captureDemoSourceFromLocation();
  }, []);

  return (
    <>
      <PageMeta
        title="Wireline | Your AI Call Assistant"
        description="Wireline calls the pharmacy, doctor, school, airline, restaurant, landlord, or support line and texts you the answer."
        image="/og-image.jpg"
      />
      <div className="wl-stitch-gradient-radial min-h-screen overflow-x-hidden bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
        <PublicSiteHeader active="home" />
        <main id="main-content" className="mx-auto max-w-7xl px-6 pb-16 pt-24 sm:pt-28">
          <section className="grid items-center gap-12 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)] lg:gap-16 lg:py-14">
            <div className="max-w-[650px]">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
                <span className="wl-stitch-status-dot" aria-hidden />
                <span className="wl-stitch-label">Live on the wire</span>
              </div>
              <h1 className="max-w-[11ch] text-balance text-[clamp(2.75rem,6vw,4.5rem)] font-semibold leading-[0.96] tracking-[-0.04em]">
                Have Wireline call the <em className="font-normal not-italic text-primary">pharmacy.</em>
              </h1>
              <p className="mt-6 max-w-[34rem] text-pretty text-lg leading-relaxed text-muted-foreground">
                Wireline makes the call, stays on the line, handles the back-and-forth, and texts you what matters.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link to="/pricing" className="marketing-btn-primary min-h-12 w-full px-6 text-[15px] font-semibold sm:w-auto">
                  Start at $9 <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/showcase" className="marketing-btn-secondary min-h-12 w-full px-6 text-[15px] font-semibold sm:w-auto">
                  <PhoneCall className="h-4 w-4" />
                  Hear an assistant
                </Link>
              </div>
              <div className="mt-8 flex flex-col gap-3 text-sm font-medium text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
                {PROOF_POINTS.map((point) => (
                  <span key={point} className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    {point}
                  </span>
                ))}
              </div>
            </div>
            <section className="relative">
              <div className="wl-stitch-card overflow-hidden p-2 shadow-sm">
                <div className="rounded-xl border border-border/60 bg-muted/30 p-5 sm:p-7">
                  <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-5">
                    <div>
                      <div className="inline-flex items-center gap-2 wl-stitch-label">
                        <Radio className="h-3 w-3" />
                        Try it live
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-[-.04em] sm:text-3xl">Hear a real call.</div>
                    </div>
                    <div className="hidden rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-semibold text-muted-foreground sm:block">
                      No account required
                    </div>
                  </div>
                  <div className="pt-5">
                    <BrowserCallWidget agentName={csDemo.name} />
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
                    <span>Calls are handled privately for you.</span>
                    <span className="font-semibold text-foreground">Listen in →</span>
                  </div>
                </div>
              </div>
            </section>
          </section>

          <section className="py-16">
            <div className="mb-10 max-w-2xl">
              <p className="wl-stitch-eyebrow">Also for teams</p>
              <h2 className="wl-stitch-headline mt-2">One workspace when calls become a front office.</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                The same calm interface scales from a personal assistant to inbound support and outbound follow-up — without a separate product.
              </p>
            </div>
            <div className="wl-stitch-bento">
              <article className="wl-stitch-card wl-stitch-card-hover wl-stitch-bento-span-2 p-8">
                <span className="grid h-10 w-10 place-items-center rounded bg-muted text-primary">
                  <Brain size={20} />
                </span>
                <h3 className="mt-6 text-xl font-semibold tracking-[-.02em]">Trained on what you approve</h3>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                  Add facts, rules, and tone in Knowledge. Studio turns plain English into behavior your assistant can repeat on every call.
                </p>
                <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 font-mono text-[13px] text-muted-foreground">
                  <p>hours.md · synced</p>
                  <p className="mt-1 text-[color:var(--wl-status-active)]">Assistant ready for live calls</p>
                </div>
              </article>
              <article className="wl-stitch-card wl-stitch-card-hover p-8">
                <span className="grid h-10 w-10 place-items-center rounded bg-muted text-primary">
                  <Lock size={20} />
                </span>
                <h3 className="mt-6 text-lg font-semibold tracking-[-.02em]">Scoped permissions</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Connections live at the workspace layer. Each assistant gets only the actions you toggle on.
                </p>
              </article>
              <article className="wl-stitch-card wl-stitch-card-hover wl-stitch-bento-span-2 p-8 md:col-span-3">
                <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <span className="grid h-10 w-10 place-items-center rounded bg-muted text-primary">
                      <MessageSquare size={20} />
                    </span>
                    <h3 className="mt-6 text-xl font-semibold tracking-[-.02em]">Voice, SMS, and email</h3>
                    <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                      Start with the call that interrupts your day. Add channels when your assistant needs to follow up the way you already work.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {["Phone", "SMS", "Email"].map((label) => (
                      <div key={label} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
                        <PhoneCall size={22} className="text-foreground" />
                        <span className="wl-stitch-label">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            </div>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/solutions/support" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
                Inbound for business →
              </Link>
              <Link to="/solutions/sales" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
                Outbound follow-up →
              </Link>
            </div>
          </section>

          <section className="pt-8">
            <LandingIntegrationStrip />
          </section>
        </main>
        <footer className="border-t border-border bg-card px-6 py-10 text-sm text-muted-foreground">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 md:flex-row">
            <span className="font-bold text-primary">Wireline</span>
            <div className="flex gap-7">
              <Link className="hover:text-foreground" to="/terms">Terms</Link>
              <Link className="hover:text-foreground" to="/privacy">Privacy</Link>
              <Link className="hover:text-foreground" to="/status">Status</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
