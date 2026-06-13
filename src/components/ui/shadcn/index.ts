/**
 * Barrel re-export for the shadcn/ui primitive layer.
 *
 * This is the **canonical** UI layer for Wireline. Pages and feature
 * components should compose primitives from here rather than rolling their
 * own `<button>` / `<input>` / modal / tabs / etc. Combined with the
 * Rich Cream + Purple tokens in `src/index.css` (`--background`, `--primary`,
 * `--card`, `--ring`, …), this guarantees:
 *
 *   - Theme/dark-mode flips work everywhere (tokens, not literals)
 *   - Focus rings, hover states, and disabled states stay consistent
 *   - Radius/shape stays sharp via the global `border-radius: 0` reset
 *
 * See `DESIGN.md` for the full guidance.
 */
export { ShadButton, buttonVariants } from "./ShadButton";
export type { ShadButtonProps } from "./ShadButton";
export * from "./Accordion";
export * from "./Alert";
export * from "./AlertDialog";
export * from "./Avatar";
export * from "./Badge";
export * from "./Card";
export * from "./Checkbox";
export * from "./Command";
export * from "./Dialog";
export * from "./DropdownMenu";
export * from "./Input";
export * from "./Textarea";
export * from "./Label";
export * from "./Popover";
export * from "./Progress";
export * from "./ScrollArea";
export * from "./Select";
export * from "./Separator";
export * from "./Sheet";
export * from "./Skeleton";
export * from "./Slider";
export * from "./Switch";
export * from "./Tabs";
export * from "./Tooltip";
