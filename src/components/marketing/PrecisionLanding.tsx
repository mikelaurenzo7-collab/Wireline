import { ArrowRight, CheckCircle2, Mail, MessageSquareText, PhoneCall, Play } from "lucide-react";
import { Link } from "react-router-dom";
import PrecisionPublicHeader from "./PrecisionPublicHeader";

const channels = [
  { label: "Voice", icon: PhoneCall },
  { label: "Email", icon: Mail },
  { label: "Text", icon: MessageSquareText },
];

export default function PrecisionLanding() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PrecisionPublicHeader />
      <main id="main-content" className="pt-16">
        <section className="border-b border-border px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="wl-measure text-center">
            <p className="wl-stitch-label">Wireline</p>
            <h1 className="mx-auto mt-4 max-w-[980px] text-balance text-[clamp(42px,6vw,68px)] font-semibold leading-[1.04] tracking-[-.05em] text-foreground">
              Personal and Business AI Assistants for your Conversations
            </h1>
            <p className="mt-5 text-[15px] font-semibold tracking-[.08em] text-primary sm:text-[16px]">
              Voice + Email + Text
            </p>
            <p className="mx-auto mt-5 max-w-[690px] text-[17px] leading-7 text-muted-foreground">
              Give Wireline the conversations that matter. Your assistant handles calls, email, and
              text under your rules, then brings you the outcome and next step.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/signup"
                className="marketing-btn-primary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
              >
                Create your assistant
              </Link>
              <Link
                to="/showcase"
                className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
              >
                <Play size={14} /> Hear a demo
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {channels.map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-foreground shadow-sm"
                >
                  <Icon size={14} className="text-primary" />
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[12px] font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-primary" /> You choose the boundaries
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-primary" /> You approve connected actions
              </span>
            </div>
          </div>
        </section>
        <section className="wl-measure px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            <article className="wl-stitch-card p-6">
              <PhoneCall className="size-5 text-primary" />
              <h2 className="mt-5 text-xl font-semibold text-foreground">
                Voice that follows your brief
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Handle calls, gather context, and return the answer when you need it.
              </p>
            </article>
            <article className="wl-stitch-card p-6">
              <Mail className="size-5 text-primary" />
              <h2 className="mt-5 text-xl font-semibold text-foreground">
                Email with a clear next step
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Keep conversations moving with your rules, context, and approval boundaries.
              </p>
            </article>
            <article className="wl-stitch-card p-6">
              <MessageSquareText className="size-5 text-primary" />
              <h2 className="mt-5 text-xl font-semibold text-foreground">
                Text that keeps you informed
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Get concise recaps and follow-up without another inbox to manage.
              </p>
            </article>
          </div>
        </section>
        <section className="border-t border-border px-4 py-16 text-center sm:px-6">
          <h2 className="mx-auto max-w-2xl text-[34px] font-semibold leading-tight tracking-[-.03em] text-foreground">
            Personal when it is your life. Business-ready when it is your work.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-muted-foreground">
            Create one assistant, give it a clear brief, and let Wireline handle the next useful
            conversation.
          </p>
          <div className="mt-8">
            <Link
              to="/features"
              className="marketing-btn-secondary px-6 py-3 text-[12px] font-semibold uppercase tracking-[.05em]"
            >
              Explore how it works <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-border px-4 py-8 text-[13px] text-muted-foreground sm:px-6">
        <div className="wl-measure flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span>
            <strong className="text-foreground">Wireline</strong> · voice + email + text, handled
          </span>
          <div className="flex gap-5">
            <Link to="/pricing">Pricing</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/support">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
