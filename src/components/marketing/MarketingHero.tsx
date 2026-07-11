import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "../../lib/utils";

type HeroAction = {
  label: string;
  to: string;
  tone?: "primary" | "secondary";
};

type HeroMetric = {
  label: string;
  value: string;
};

type MarketingHeroProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  primaryAction?: HeroAction;
  secondaryAction?: HeroAction;
  proof?: readonly string[];
  metrics?: readonly HeroMetric[];
  visualEyebrow?: string;
  visualTitle?: ReactNode;
  visualBody?: ReactNode;
  visualItems?: readonly string[];
  visual?: ReactNode;
  className?: string;
  compact?: boolean;
};

function isExternalHref(href: string): boolean {
  return /^(tel:|mailto:|https?:)/.test(href);
}

export default function MarketingHero({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  proof = [],
  metrics = [],
  visualEyebrow = "Operating loop",
  visualTitle = "Build. Train. Wire. Run.",
  visualBody = "One clean path from role definition to real conversations, outcomes, and follow-up.",
  visualItems = ["Create the employee", "Teach the playbook", "Connect the number", "Review the result"],
  visual,
  className,
  compact = false,
}: MarketingHeroProps) {
  const actions = [primaryAction, secondaryAction].filter(Boolean) as HeroAction[];
  const isBrandSpine = typeof title === "string" && title === "Wire → Work → Win";

  return (
    <section
      className={cn(
        "marketing-hero border-b border-border px-5 sm:px-8 lg:px-10",
        compact ? "py-12 sm:py-16 lg:py-20" : "py-14 sm:py-20 lg:py-24",
        isBrandSpine && "wireline-home-hero",
        className,
      )}
    >
      <div
        className={cn(
          "wl-public-rail grid gap-10 lg:items-center",
          isBrandSpine
            ? "lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,.68fr)]"
            : "lg:grid-cols-[minmax(0,1fr)_minmax(20rem,.72fr)]",
        )}
      >
        <div className="marketing-hero__content min-w-0 max-w-[60rem] text-left">
          {eyebrow ? (
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 shadow-[var(--wireline-elevation-sm)]">
              <span className="marketing-live-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />
              <span className="wl-eyebrow wl-eyebrow--wired min-w-0 truncate text-muted-foreground">
                {eyebrow}
              </span>
            </div>
          ) : null}

          <h1
            className={cn(
              "marketing-hero__title max-w-[18.75ch] text-balance font-[var(--wireline-font-family-display)] text-[clamp(2.85rem,6.05vw,6.1rem)] font-bold leading-[.92] tracking-[-.055em] text-foreground md:max-w-[21ch] lg:max-w-[18.75ch]",
              eyebrow ? "mt-6" : "mt-0",
              isBrandSpine &&
                "max-w-none whitespace-nowrap text-[clamp(2.1rem,9.8vw,5.65rem)] tracking-[-.065em] sm:text-[clamp(3.4rem,6.4vw,5.65rem)] md:max-w-none lg:max-w-none",
            )}
          >
            {title}
          </h1>

          <p
            className={cn(
              "marketing-hero__description mt-6 max-w-[48rem] text-pretty text-[1.0625rem] leading-8 text-muted-foreground sm:text-[1.2rem] sm:leading-[1.62]",
              isBrandSpine &&
                "mt-5 max-w-[38rem] font-[var(--wireline-font-family-display)] text-[clamp(1rem,2.1vw,1.3rem)] font-semibold leading-snug tracking-[-.015em]",
            )}
          >
            {description}
          </p>

          {actions.length ? (
            <div className="marketing-hero__actions mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {actions.map((action) => {
                const primary = action.tone !== "secondary";
                const actionClassName = cn(
                  primary ? "marketing-btn-primary" : "marketing-btn-secondary",
                  "min-h-12 justify-center px-6 text-[15px] font-semibold sm:w-auto",
                );
                const children = (
                  <>
                    {action.label}
                    {primary ? <ArrowRight size={16} aria-hidden="true" /> : null}
                  </>
                );

                return isExternalHref(action.to) ? (
                  <a
                    key={`${action.to}-${action.label}`}
                    href={action.to}
                    className={actionClassName}
                  >
                    {children}
                  </a>
                ) : (
                  <Link
                    key={`${action.to}-${action.label}`}
                    to={action.to}
                    className={actionClassName}
                  >
                    {children}
                  </Link>
                );
              })}
            </div>
          ) : null}

          {proof.length ? (
            <ul className="mt-7 flex flex-wrap gap-2.5" aria-label="Wireline proof points">
              {proof.map((item) => (
                <li
                  key={item}
                  className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-muted-foreground"
                >
                  <span
                    className="marketing-proof-chip grid h-[18px] w-[18px] place-items-center"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <aside
          className="wl-paper relative overflow-hidden rounded-[22px] p-5 sm:p-6 lg:p-7"
          aria-label="Wireline operating preview"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            aria-hidden="true"
            style={{
              background:
                "radial-gradient(circle at 18% 0%, var(--wireline-color-glow-primary), transparent 44%)",
            }}
          />
          <div className="relative">
            {visual ?? (
              <>
                <p className="wl-eyebrow wl-eyebrow--no-rule text-primary">{visualEyebrow}</p>
                <h2 className="mt-4 font-[var(--wireline-font-family-display)] text-[clamp(2rem,3.2vw,3.2rem)] font-bold leading-[.98] tracking-[-.045em] text-foreground">
                  {visualTitle}
                </h2>
                <p className="mt-4 text-[15px] leading-7 text-muted-foreground">{visualBody}</p>
                <ol className="mt-7 grid gap-3">
                  {visualItems.map((item, index) => (
                    <li
                      key={item}
                      className="flex items-center gap-3 rounded-[14px] border border-border bg-background/70 px-4 py-3"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card font-mono text-[11px] font-bold text-primary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{item}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}

            {metrics.length ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-[14px] border border-border bg-card/70 p-4">
                    <p className="font-[var(--wireline-font-family-display)] text-3xl font-bold leading-none tracking-[-.04em] text-foreground">
                      {metric.value}
                    </p>
                    <p className="mt-2 text-[12px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
                      {metric.label}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
