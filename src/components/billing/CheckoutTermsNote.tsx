import { Link } from "react-router";

import { cn } from "../../lib/utils";

/**
 * Cancellation and refund terms, stated where an owner starts a checkout.
 * The wording matches /pricing and /terms (LegalPage) so the promise is the
 * same everywhere it appears; change all three together.
 */
export const CHECKOUT_TERMS_TEXT =
  "Cancel anytime; cancellation takes effect at the end of your billing period. Request a refund within 30 days of your first paid invoice. Usage purchases, third-party fees, and later invoices are excluded.";

export default function CheckoutTermsNote({
  className,
  onNavigate,
}: {
  className?: string;
  /** Called before following the Terms link, for surfaces inside a dialog. */
  onNavigate?: () => void;
}) {
  return (
    <p
      className={cn("text-xs leading-5 text-muted-foreground", className)}
      data-checkout-terms="true"
    >
      {CHECKOUT_TERMS_TEXT}{" "}
      <Link
        to="/terms"
        onClick={onNavigate}
        className="font-semibold text-foreground underline underline-offset-2"
      >
        See Terms
      </Link>
      .
    </p>
  );
}
