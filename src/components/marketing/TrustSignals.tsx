import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

const TRUST_POINTS = [
  {
    title: "Private by Default",
    detail: "Create and train your Bot, then rehearse privately before any customer conversation.",
  },
  {
    title: "Clear Boundaries",
    detail: "Set approved answers, handoff rules, and recording preferences for each Bot.",
  },
  {
    title: "Controlled Handoff",
    detail: "Escalations reach the right person with the conversation context intact.",
  },
  {
    title: "Outcome Record",
    detail: "Review call records, approvals, and computer task results from your workspace.",
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
            ["/support", "Support"],
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
