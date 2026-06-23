import { ArrowRight, CheckCircle2, Mail, MessageSquareText, PhoneCall, Play } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingFooter from "./MarketingFooter";
import PrecisionPublicHeader from "./PrecisionPublicHeader";

const channels = [
  {
    label: "Voice",
    title: "Calls handled on your terms",
    body: "Give it the brief, boundaries, and escalation path. Wireline handles the conversation and brings back the answer.",
    icon: PhoneCall,
  },
  {
    label: "Email",
    title: "Inbox motion with guardrails",
    body: "Keep follow-ups moving with your context, approval limits, and a clear next step for every thread.",
    icon: Mail,
  },
  {
    label: "Text",
    title: "Text that turns interest into action",
    body: "Reply to inbound leads, run opt-in marketing and sales follow-up, book and confirm appointments, re-engage customers, and keep your team in the loop.",
    icon: MessageSquareText,
  },
];

export default function PrecisionLanding() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <PrecisionPublicHeader />
      <main id="main-content" className="pt-16" tabIndex={-1}>
        <section className="border-b border-border px-5 py-12 sm:px-6 sm:py-20 lg:px-8">
          <div className="wl-measure mx-auto text-center">
            <p className="wl-overline text-primary">Personal + business AI assistants</p>
            <h1 className="mx-auto mt-4 max-w-[780px] text-[clamp(38px,7vw,68px)] font-semibold leading-[1.02] tracking-[-.055em] text-foreground sm:mt-5">
              Every conversation, handled.
            </h1>
            <p className="mt-5 text-[14px] font-semibold tracking-[.08em] text-primary sm:text-[16px]">
              Voice + Email + Text
            </p>
            <p className="mx-auto mt-5 max-w-[650px] text-[17px] leading-7 text-muted-foreground sm:text-[18px] sm:leading-8">
              Give Wireline the brief. It handles calls, inboxes, and texts—from personal errands to leads, appointments, and customer follow-up—under your rules.
            </p>
            <div className="mx-auto mt-8 grid max-w-md gap-3 sm:max-w-none sm:grid-cols-2 sm:justify-center">
              <Link to="/signup" className="marketing-btn-primary min-h-12 px-6 text-[13px] font-semibold uppercase tracking-[.05em]">
                Create your assistant
                <ArrowRight size={16} />
              </Link>
              <Link to="/showcase" className="marketing-btn-secondary min-h-12 px-6 text-[13px] font-semibold uppercase tracking-[.05em]">
                <Play size={15} /> Hear a demo
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[12px] font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-primary" /> You define the boundaries
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-primary" /> You approve connected actions
              </span>
            </div>
          </div>
        </section>

        <section className="wl-measure mx-auto px-5 py-10 sm:px-6 sm:py-16 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {channels.map(({ label, title, body, icon: Icon }) => (
              <article key={label} className="wl-stitch-card flex min-h-[220px] flex-col p-6 sm:p-7">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <p className="wl-overline mt-5 text-primary">{label}</p>
                <h2 className="wl-section-title mt-2 text-[clamp(22px,4vw,26px)]">{title}</h2>
                <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border px-5 py-12 text-center sm:px-6 sm:py-16">
          <div className="wl-measure mx-auto">
            <p className="wl-overline">Start with one clear brief</p>
            <h2 className="mx-auto mt-3 max-w-2xl text-[clamp(28px,5vw,42px)] font-semibold leading-[1.08] tracking-[-.04em] text-foreground">
              Delegate the conversation. Keep the decision.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[16px] leading-7 text-muted-foreground">
              Start with a pharmacy call, a text-back workflow for new leads, appointment confirmation, or customer coverage. Expand when the job earns it.
            </p>
            <div className="mt-7">
              <Link to="/for/personal" className="marketing-btn-secondary min-h-12 px-6 text-[13px] font-semibold uppercase tracking-[.05em]">
                Explore how it works <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
