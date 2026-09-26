import { Link } from "react-router";

import { Button } from "../atoms";
import { SOFT_OPEN_CHECKOUT_COPY } from "../../lib/wireline-onboarding-copy";

/** Calm live-number note while self-serve checkout stays closed. */
export default function SoftOpenCheckoutNote({
  detail = SOFT_OPEN_CHECKOUT_COPY.detail,
}: {
  detail?: string;
}) {
  return (
    <section
      className="rounded-xl border border-border bg-card px-4 py-4 sm:px-5 sm:py-5"
      aria-label={SOFT_OPEN_CHECKOUT_COPY.title}
    >
      <p className="text-sm font-semibold text-foreground">{SOFT_OPEN_CHECKOUT_COPY.title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{detail}</p>
      <Button asChild size="sm" className="mt-4">
        <Link to={SOFT_OPEN_CHECKOUT_COPY.href}>{SOFT_OPEN_CHECKOUT_COPY.cta}</Link>
      </Button>
    </section>
  );
}
