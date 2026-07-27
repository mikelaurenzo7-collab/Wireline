import { ArrowRight, CircleDollarSign, FileCheck2, LockKeyhole, Route } from "lucide-react";
import { Link } from "react-router-dom";

const TRUST_POINTS = [
  {
    icon: LockKeyhole,
    title: "Private by default",
    detail: "Build, train, and test before the agent reaches a real conversation.",
  },
  {
    icon: CircleDollarSign,
    title: "Visible spend",
    detail: "Included capacity is used first. Additional provider work stays prepaid.",
  },
  {
    icon: Route,
    title: "Controlled handoff",
    detail: "Escalations reach the right person with the conversation context intact.",
  },
  {
    icon: FileCheck2,
    title: "Outcome record",
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
          <p className="wl-overline text-primary">Operational trust</p>
          <h2 id="trust-heading" className="wl-section-title mx-auto mt-3 max-w-[20ch]">
            Built to stay under your control.
          </h2>
        </div>

        <div className="mt-8 grid overflow-hidden rounded-[1.05rem] border border-border bg-card sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border">
          {TRUST_POINTS.map(({ icon: Icon, title, detail }) => (
            <article key={title} className="wl-trust-point p-5 text-center sm:p-6">
              <span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-primary/8 text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h3 className="wl-trust-point__title mt-4 text-foreground">{title}</h3>
              <p className="wl-trust-point__detail mx-auto mt-2 text-muted-foreground">{detail}</p>
            </article>
          ))}
        </div>

        <nav
          className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
          aria-label="Trust resources"
        >
          {[
            ["/trust", "Trust Center"],
            ["/security", "Security"],
            ["/status", "System status"],
          ].map(([to, label]) => (
            <Link key={to} to={to} className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
              {label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
