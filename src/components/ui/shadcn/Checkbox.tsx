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
 * The default styling matches the rest of the shadcn layer: 1px ring border
 * using `border-input`, focus ring via `--ring`, brand accent on the checked
 * state, and disabled opacity parity with `Input` / `Switch`.
 */
const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentPropsWithoutRef<"input">, "type">
>(({ className, ...props }, ref) => (
  <input
    type="checkbox"
    ref={ref}
    className={cn(
      "h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-[var(--wireline-radius-xs)] border border-border bg-card align-middle transition-colors",
      "checked:border-primary checked:bg-primary",
      "checked:bg-[length:100%_100%] checked:bg-center checked:bg-no-repeat",
      "checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22white%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%223 8.5 6.5 12 13 4.5%22/></svg>')]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
