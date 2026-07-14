import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "./atoms";
import WirelineMark from "./brand/WirelineMark";

type TransitionDetail = {
  label: string;
  value: string;
};

type TransitionAction = {
  href: string;
  label: string;
  variant?: "default" | "secondary" | "outline";
};

type TransitionSurfaceProps = {
  eyebrow: string;
  title: string;
  description?: string;
  busyLabel?: string;
  busy?: boolean;
  details?: TransitionDetail[];
  actions?: TransitionAction[];
  className?: string;
};

export default function TransitionSurface({
  eyebrow,
  title,
  description,
  busyLabel = "Working",
  busy = true,
  details = [],
  actions = [],
  className = "",
}: TransitionSurfaceProps) {
  return (
    <div className={`wl-transition-shell ${className}`.trim()}>
      <main className="wl-transition-rail" role="status" aria-live="polite" aria-busy={busy}>
        <div className="wl-transition-brand">
          <span className="wl-transition-mark">
            <WirelineMark className="size-5 text-primary" />
          </span>
          <span className="wl-overline">Wireline</span>
        </div>

        <section className="studio-card wl-transition-panel">
          <header className="wl-transition-copy">
            <p className="studio-kicker">{eyebrow}</p>
            <h1 className="wl-section-title">{title}</h1>
            {description ? <p className="wl-transition-description">{description}</p> : null}
          </header>

          {busy ? (
            <div className="wl-transition-status">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
              <span>{busyLabel}</span>
            </div>
          ) : null}

          {details.length ? (
            <dl className="wl-transition-details">
              {details.map((detail) => (
                <div key={detail.label} className="wl-transition-detail">
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {actions.length ? (
            <div className="wl-transition-actions">
              {actions.map((action) => (
                <Button key={action.href} asChild variant={action.variant ?? "default"}>
                  <Link to={action.href}>{action.label}</Link>
                </Button>
              ))}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
