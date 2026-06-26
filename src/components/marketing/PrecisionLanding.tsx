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
                A call comes in. The agent answers, captures context, drafts the follow-up, and
                leaves the next approval waiting in Studio.
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

        <MarketingFooter />
      </main>
    </div>
  );
}
