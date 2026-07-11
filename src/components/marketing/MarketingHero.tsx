import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { MARKETING_VOICE } from "../../lib/product-copy";
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
  visual,
  className,
  compact = false,
}: MarketingHeroProps) {
  const actions = [primaryAction, secondaryAction].filter(Boolean) as HeroAction[];
  const isBrandSpine = typeof title === "string" && title === MARKETING_VOICE.headline;

  return (
    <section
      className={cn(
        "marketing-hero border-b border-border px-5 sm:px-8 lg:px-10",
        compact
          ? "py-10 sm:py-12 lg:py-16"
          : isBrandSpine
            ? "py-14 sm:py-20 lg:py-24"
            : "py-12 sm:py-16 lg:py-20",
        isBrandSpine && "wireline-home-hero",
        className,
      )}
    >
      <div className="wl-public-rail">
        <div
          className={cn(
            "marketing-hero__content mx-auto flex max-w-[70rem] flex-col items-center text-center",
            isBrandSpine && "wireline-home-hero__content",
          )}
        >
          {eyebrow ? (
            <div className="inline-flex max-w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 shadow-[var(--wireline-elevation-sm)]">
              <span className="marketing-live-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />
              <span className="wl-eyebrow wl-eyebrow--wired min-w-0 truncate text-muted-foreground">
                {eyebrow}
              </span>
            </div>
          ) : null}

          <h1
            aria-label={isBrandSpine ? "Wire. Work. Win." : undefined}
            className={cn(
              "marketing-hero__title mx-auto max-w-[22ch] text-balance font-[var(--wireline-font-family-display)] text-[clamp(2.1rem,4.3vw,3.5rem)] font-bold uppercase leading-[0.98] tracking-[-.005em] text-foreground",
              eyebrow ? "mt-6" : "mt-0",
              isBrandSpine &&
                "max-w-[16ch] text-[clamp(2.6rem,6vw,5rem)] leading-[0.9] tracking-[-.015em]",
            )}
          >
            {title}
          </h1>

          <p
            className={cn(
              "marketing-hero__description mx-auto mt-6 max-w-[52rem] text-pretty text-[1.0625rem] leading-8 text-muted-foreground sm:text-[1.2rem] sm:leading-[1.62]",
              isBrandSpine &&
                "max-w-[42rem] font-[var(--wireline-font-family-display)] text-[clamp(1.05rem,2.1vw,1.4rem)] font-semibold leading-snug tracking-[-.015em]",
            )}
          >
            {description}
          </p>

          {actions.length ? (
            <div className="marketing-hero__actions mt-9">
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
            <ul
              className="mt-7 flex max-w-3xl flex-wrap justify-center gap-2"
              aria-label="Wireline proof points"
            >
              {proof.map((item) => (
                <li
                  key={item}
                  className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[13px] font-medium text-muted-foreground"
                >
                  <span className="h-1 w-1 rounded-full bg-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {visual ? (
          <div className="marketing-hero__experience wl-paper mx-auto mt-12 max-w-4xl overflow-hidden rounded-[22px] p-5 text-center sm:p-7 lg:p-9">
            {visual}
            {metrics.length ? (
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-[14px] border border-border bg-card/70 p-4 text-center"
                  >
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
        ) : metrics.length ? (
          <div className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="wl-paper rounded-[14px] p-5 text-center">
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
    </section>
  );
}
