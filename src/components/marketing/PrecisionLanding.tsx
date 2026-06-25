import { ArrowRight, Mail, MessageSquareText, PhoneCall, Play } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingFooter from "./MarketingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import HeroCallPreview from "./HeroCallPreview";
import BrowserCallWidget from "./BrowserCallWidget";

const channels = [
  {
    label: "Voice",
    title: "Calls handled on your terms",
    icon: PhoneCall,
  },
  {
    label: "Email",
    title: "Inbox motion with guardrails",
    icon: Mail,
  },
  {
    label: "Text",
    title: "Text that turns interest into action",
    icon: MessageSquareText,
  },
];

export default function PrecisionLanding() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <PrecisionPublicHeader />
      <main id="main-content" className="pt-16" tabIndex={-1}>
        <section className="marketing-hero border-b border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="wl-measure mx-auto grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(330px,.72fr)] lg:gap-14">
            <div className="max-w-[760px] text-center lg:text-left">
              <p className="wl-overline text-primary">Personal + business AI assistants</p>
              <h1 className="mt-4 font-[var(--wireline-font-display)] text-[clamp(42px,5vw,66px)] font-semibold leading-[1.03] tracking-[-.055em] text-foreground sm:mt-5">
                Every conversation, handled.
              </h1>
              <p className="mt-5 text-[var(--wireline-typography-body-size)] font-semibold tracking-[.08em] text-primary sm:text-[var(--wireline-typography-body-size)]">
                Voice + Email + Text
              </p>
              <p className="mt-5 max-w-[520px] text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground lg:mx-0">
                One agent. Your rules. Voice, email, text.
              </p>
              <div className="mt-8 grid gap-3 sm:max-w-none sm:grid-cols-2 lg:max-w-[510px]">
                <Link
                  to="/signup"
                  className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                >
                  Create your assistant <ArrowRight size={16} />
                </Link>
                <Link
                  to="/showcase"
                  className="marketing-btn-secondary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
                >
                  <Play size={15} /> Hear a demo
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[var(--wireline-typography-caption-size)] font-medium text-muted-foreground lg:justify-start">
                <span className="flex items-center gap-1.5">You set the rules. It executes.</span>
              </div>
            </div>
            <HeroCallPreview />
          </div>
        </section>
        <section className="wl-measure mx-auto px-5 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <div className="mb-6">
            <p className="wl-overline text-primary">Your agent. Every channel.</p>
            <h2 className="mt-2 font-[var(--wireline-font-display)] text-[clamp(26px,3vw,38px)] font-semibold leading-[1.1] tracking-[-.04em]">
              It works the same. Your rules.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {channels.map(({ label, title, icon: Icon }) => (
              <article
                key={label}
                className="wl-stitch-card marketing-channel-card flex flex-col p-6 sm:p-7"
              >
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <p className="wl-overline mt-5 text-primary">{label}</p>
                <h2 className="wl-section-title mt-2 text-[clamp(22px,4vw,26px)]">{title}</h2>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border px-5 py-10 sm:px-6 sm:py-12 lg:px-8">
          <div className="wl-measure mx-auto">
            <div className="mx-auto max-w-md text-center">
              <p className="wl-overline text-primary">Prove it yourself</p>
              <h3 className="mt-1 font-[var(--wireline-font-display)] text-[clamp(20px,3vw,26px)] font-semibold tracking-[-.02em]">
                Talk to a live agent in your browser.
              </h3>
            </div>
            <div className="mt-6 flex justify-center">
              <BrowserCallWidget agentName="Sarah" buttonLabel="Talk to demo agent" />
            </div>
            <p className="mt-3 text-center text-[var(--wireline-typography-caption-size)] text-muted-foreground">
              Real voice. Your rules apply.
            </p>
          </div>
        </section>

        <section className="border-t border-border px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="wl-measure mx-auto text-center">
            <h2 className="mx-auto max-w-2xl font-[var(--wireline-font-display)] text-[clamp(30px,4vw,44px)] font-semibold leading-[1.08] tracking-[-.045em] text-foreground">
              See it handle real conversations.
            </h2>
            <div className="mt-7">
              <Link
                to="/signup"
                className="marketing-btn-primary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                Create your first agent <ArrowRight size={15} />
              </Link>
            </div>
            <div className="mt-3">
              <Link
                to="/showcase"
                className="marketing-btn-secondary min-h-12 px-6 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]"
              >
                <Play size={15} /> Watch demos
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
