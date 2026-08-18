import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

const TRUST_POINTS = [
  {
    title: "Private by Default",
    detail: "Build, train, and test before the agent reaches a real conversation.",
  },
  {
    // The enforced compliance stack (TCPA calling hours, DNC checks before
    // marketing dials, instant opt-out honoring; see tcpa-calling-hours.ts,
    // outbound-dial-gate.ts, dnc-failsafe.ts) is a real differentiator that
    // was hidden a click deep in /trust. The spend story this tile replaced
    // is already told by the plan cards on the same page.
    title: "Compliant by Default",
    detail:
      "Calling-hour rules, Do Not Call checks, and instant opt-outs are enforced in the runtime before any dial.",
  },
  {
    title: "Controlled Handoff",
    detail: "Escalations reach the right person with the conversation context intact.",
  },
  {
    title: "Outcome Record",
    detail: "Calls, texts, email, approvals, and next steps stay in one auditable history.",
  },
] as const;

export default function TrustSignals() {
  return (
    <section
      className="wl-public-section--tight border-t border-border"
      aria-labelledby="trust-heading"
      data-testid="trust-signals"
    >
      <div className="wl-public-rail">
        <div className="mx-auto max-w-2xl text-center">
          <p className="wl-eyebrow wl-eyebrow--wired text-primary">Operational Trust</p>
          <h2 id="trust-heading" className="wl-display-2 mx-auto mt-4 max-w-[20ch]">
            Built to Stay Under Your Control
          </h2>
        </div>

        <div className="mt-8 grid overflow-hidden rounded-[1.05rem] border border-border bg-card sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border">
          {TRUST_POINTS.map(({ title, detail }) => (
            <article key={title} className="wl-trust-point p-5 text-center sm:p-6">
              <h3 className="wl-trust-point__title text-foreground">{title}</h3>
              <p className="wl-trust-point__detail mx-auto mt-2 text-muted-foreground">{detail}</p>
            </article>
          ))}
        </div>

        <nav
          className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
          aria-label="Trust Resources"
        >
          {[
            ["/trust", "Trust Center"],
            ["/security", "Security"],
            ["/status", "System Status"],
          ].map(([to, label]) => (
            <Link
              key={to}
              to={to}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              {label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
