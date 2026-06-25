import { ArrowRight, Mail, MessageSquareText, PhoneCall, Play } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingFooter from "./MarketingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import HeroCallPreview from "./HeroCallPreview";
import BrowserCallWidget from "./BrowserCallWidget";

const channels = [
  {
    label: "Voice",
    title: "Calls, on your terms.",
    icon: PhoneCall,
  },
  {
    label: "Email",
    title: "Follow-up that stays on brief.",
    icon: Mail,
  },
  {
    label: "Text",
    title: "Replies that sound like you.",
    icon: MessageSquareText,
  },
] as const;

export default function PrecisionLanding() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <PrecisionPublicHeader />
      <main id="main-content" className="pt-16" tabIndex={-1}>
        <section className="marketing-hero border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="wl-public-rail grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.78fr)] lg:gap-14">
            <div className="marketing-hero__content">
              <p className="wl-overline text-primary">Personal + business AI assistants</p>
              <h1 className="mt-4 max-w-[11ch] font-[var(--wireline-font-display)] text-[clamp(42px,5vw,66px)] font-semibold leading-[1.03] tracking-[-.055em] text-foreground sm:mt-5">
                Every conversation, handled.
              </h1>
              <p className="wl-public-copy mt-5">
                Voice, email, and text—shaped around your voice, priorities, and workflow.
              </p>
              <div className="marketing-hero__actions mt-8">
                <Link
                  to="/signup"
                  className="marketing-btn-primary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                >
                  Create your assistant <ArrowRight size={16} />
                </Link>
                <Link
                  to="/showcase"
                  className="marketing-btn-secondary px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                >
                  <Play size={15} /> Hear a demo
                </Link>
              </div>
            </div>
            <HeroCallPreview />
          </div>
        </section>

        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="wl-public-rail">
            <p className="wl-overline text-primary">One operating model</p>
            <h2 className="wl-public-section-heading mt-3">One assistant. Every channel.</h2>
            <p className="wl-public-copy mt-4 max-w-2xl">
              Your voice, playbook, and handoff stay consistent wherever the conversation begins.
            </p>
            <div className="marketing-channel-grid mt-8">
              {channels.map(({ label, title, icon: Icon }) => (
                <article key={label} className="wl-stitch-card marketing-channel-card flex flex-col p-6 sm:p-7">
                  <div>
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                    <p className="wl-overline mt-5 text-primary">{label}</p>
                  </div>
                  <h3 className="wl-section-title text-[clamp(22px,4vw,28px)]">{title}</h3>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-public-rail">
            <div className="marketing-demo-surface">
              <div>
                <p className="wl-overline text-primary">Hear it work</p>
                <h2 className="mt-2 font-[var(--wireline-font-display)] text-[clamp(26px,3vw,38px)] font-semibold tracking-[-.04em]">
                  Talk to a live assistant.
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <BrowserCallWidget agentName="Sarah" buttonLabel="Talk to demo agent" />
                <Link
                  to="/signup"
                  className="marketing-btn-secondary min-h-12 px-5 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                >
                  Build yours <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
