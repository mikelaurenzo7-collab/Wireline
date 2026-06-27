import { useState } from "react";
import { ArrowRight, Mail, MessageSquareText, PhoneCall } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingFooter from "./MarketingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";

const channels = [
  {
    label: "Calls",
    title: "Answer in your voice.",
    body: "Inbound, outbound, handoff, approvals, and clean summaries.",
    icon: PhoneCall,
  },
  {
    label: "Texts",
    title: "Keep the thread moving.",
    body: "Confirmations, follow-up, status updates, and handoff prompts.",
    icon: MessageSquareText,
  },
  {
    label: "Email",
    title: "Close the loop.",
    body: "Approved replies, recaps, next steps, and integration-backed work.",
    icon: Mail,
  },
] as const;

export default function PrecisionLanding() {
  return (
    <div className="wl-viewport-frame bg-background text-foreground">
      <PrecisionPublicHeader />
      <main id="main-content" className="wl-viewport-scroll pt-16" tabIndex={-1}>
        <section className="marketing-hero border-b border-border px-5 py-8 sm:px-6 lg:px-8">
          <div className="wl-public-rail flex min-h-[calc(78dvh-4rem)] flex-col items-center justify-center py-6 text-center">
            <div className="marketing-hero__content flex flex-col items-center">
              <p className="wl-overline text-primary">Wireline OS</p>
              <h1 className="mx-auto mt-4 max-w-[18ch] font-[var(--wireline-font-display)] text-[clamp(46px,6.7vw,84px)] font-semibold leading-[.94] tracking-[-.055em] text-foreground">
                Agents for every conversation.
              </h1>
              <p className="wl-public-copy mx-auto mt-5 max-w-5xl text-[clamp(17px,1.7vw,22px)] leading-[1.38]">
                Calls, texts, follow-up. Handled.
              </p>
              <div className="marketing-hero__actions mt-8 justify-center">
                <Link
                  to="/signup"
                  className="marketing-btn-primary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                >
                  Create agent <ArrowRight size={16} />
                </Link>
                <Link
                  to="/features"
                  className="marketing-btn-secondary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                >
                  See OS
                </Link>
              </div>
            </div>
            <div className="marketing-hero-proof mt-7">
              {["Create", "Train", "Run", "Calls", "Texts", "Follow-up"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-12 sm:px-6 lg:px-8">
          <div className="wl-public-rail text-center">
            <div className="mx-auto max-w-3xl">
              <p className="wl-overline text-primary">First run</p>
              <h2 className="wl-public-section-heading mx-auto mt-3">
                Watch one agent become the front desk.
              </h2>
              <p className="wl-public-copy mx-auto mt-4">
                Call in. Answer. Capture. Follow-up queued. Approval ready.
              </p>
            </div>
            <div className="marketing-channel-grid mt-8">
              {channels.map(({ label, title, body, icon: Icon }) => (
                <article key={label} className="marketing-channel-row">
                  <div className="marketing-channel-row__icon">
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="wl-overline text-primary">{label}</p>
                    <h3 className="wl-section-title mt-1 text-[clamp(22px,3vw,30px)]">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
                  </div>
                </article>
              ))}
            </div>
            <Link
              to="/signup"
              className="marketing-btn-primary mx-auto mt-8 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
            >
              Start the run <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        {/* New marketing visuals: clever creative hero illustration + video demo.
            Matches Wireline Mono branding exactly: #F7F7F4 warm paper canvas,
            #111111 deep charcoal accents, Inter typography, clean minimalist
            professional aesthetic. Purposeful for hero or demo placements. */}
        <section className="border-b border-border px-5 py-12 sm:px-6 lg:px-8">
          <div className="wl-public-rail text-center">
            <div className="mx-auto max-w-3xl">
              <p className="wl-overline text-primary">One voice. All channels.</p>
              <h2 className="wl-public-section-heading mx-auto mt-3">Direct the work.</h2>
              <p className="wl-public-copy mx-auto mt-4">One voice. All channels. No drift.</p>
            </div>

            {/* Creative hero visual (image deliverable) */}
            <figure className="marketing-visual mt-8 mx-auto max-w-[1100px]">
              <img
                src="/marketing/one-voice-all-channels-hero.jpg"
                alt="One voice. All channels. — Minimalist hero visual: central Wireline agent hub in deep charcoal directing clean branching connections to phone, message, and email icons on warm off-white paper canvas. Clean professional Inter-style typography."
                className="w-full rounded-[var(--radius-xl)] border border-[var(--wireline-color-border-default)]"
                style={{ boxShadow: "var(--wireline-elevation-sm)" }}
              />
              <figcaption className="mt-3 text-xs text-muted-foreground tracking-[0.08em] uppercase">
                Create. Train. Run. — unified across every channel.
              </figcaption>
            </figure>

            {/* Video deliverable + live interactive (code-powered, exceeds static design) */}
            <div className="mt-12 mx-auto max-w-[960px]">
              <p className="wl-overline text-primary mb-3">See the flow in action</p>
              <div className="marketing-demo-surface p-2 sm:p-3">
                <video
                  src="/marketing/one-voice-direct-work-demo.mp4"
                  className="w-full rounded-[var(--radius-lg)] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)]"
                  autoPlay
                  muted
                  loop
                  playsInline
                  aria-label="Elegant animation: signals travel into a central voice hub. One voice directs unified work back across calls, texts and email channels. Perfect Wireline Mono branding."
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Signals arrive from every channel. One voice directs the work out — cleanly,
                consistently.
              </p>

              {/* Live simulator: direct in real time. Better than any static mockup. */}
              <LiveDirectSimulator />
            </div>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}

function LiveDirectSimulator() {
  const [active, setActive] = useState<string | null>(null);
  const channels = [
    { key: "call", label: "Call", icon: PhoneCall },
    { key: "text", label: "Text", icon: MessageSquareText },
    { key: "email", label: "Email", icon: Mail },
  ] as const;

  const trigger = (key: string) => {
    setActive(key);
    // auto reset for repeat directs — feels alive
    setTimeout(() => setActive(null), 1400);
  };

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-5 text-left">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        <span>Direct live</span>
        <span className="font-mono">Create • Train • Run</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {channels.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => trigger(key)}
            className={`group flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all active:scale-[0.985] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 ${
              active === key
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-background hover:border-primary/40 hover:bg-accent"
            }`}
            aria-pressed={active === key}
          >
            <Icon
              size={15}
              className={active === key ? "" : "text-primary/80 group-hover:text-primary"}
              aria-hidden
            />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Visual hub response — pure code micro interaction */}
      <div className="mt-5 flex justify-center">
        <div className="relative flex h-12 w-full max-w-[420px] items-center justify-center rounded-full border border-border/60 bg-background">
          <div
            className={`absolute h-2 w-2 rounded-full bg-primary transition-all ${active ? "scale-150 opacity-90" : "scale-100 opacity-40"}`}
          />
          <span className="text-[10px] font-mono tracking-[0.12em] text-muted-foreground">
            {active
              ? `${active.toUpperCase()} SIGNAL → AGENT HUB → ACTION QUEUED`
              : "AGENT HUB • ONE VOICE"}
          </span>
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground/70">
        Tap a channel. Watch the work route live.
      </p>
    </div>
  );
}
