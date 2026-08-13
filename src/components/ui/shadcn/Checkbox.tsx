import * as React from "react";
import { cn } from "../../../lib/utils";

/**
 * shadcn-style Checkbox.
 *
 * Wraps the native `<input type="checkbox">` so feature code can render
 * checkboxes without re-introducing raw `<input>` (which would re-grow
 * the rawInput ratchet in `shadcn-pivot-ratchet.test.ts`). We intentionally
 * style the native element rather than depending on @radix-ui/react-checkbox
 * to avoid adding a new runtime dependency for a control the browser already
 * ships and that ships accessible behaviour out of the box.
 *
 * The default styling matches the rest of the shadcn layer: a 1px border using
 * the secondary-text token at 70% opacity (strong enough to identify an empty
 * control on both themes), focus ring via `--ring`, brand accent on the checked
 * state, and disabled opacity parity with `Input` / `Switch`.
 *
 * The checked fill and tick live in `styles/components.css` under
 * `[data-slot="checkbox"]`, not in a Tailwind arbitrary value. An inline
 * `checked:bg-[url('data:…<svg … viewBox="0 0 16 16" …>')]` carries literal
 * spaces, and `cn()` splits its argument on whitespace before merging: the one
 * class became fifteen garbage tokens, tailwind-merge read the truncated
 * `checked:bg-[url('data:image/svg+xml;utf8,<svg` as a background conflict and
 * dropped `checked:bg-primary`, and the checkbox rendered with no fill and no
 * tick in the checked state. CSS has no such quoting hazard.
 */
const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentPropsWithoutRef<"input">, "type">
>(({ className, ...props }, ref) => (
  <input
    type="checkbox"
    ref={ref}
    data-slot="checkbox"
    className={cn(
      "h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-[var(--wireline-radius-xs)] border border-muted-foreground/70 bg-card align-middle transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
