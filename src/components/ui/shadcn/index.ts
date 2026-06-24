/**
 * Compatibility exports for legacy shadcn/ui import paths.
 *
 * Canonical reusable primitives live in `src/components/atoms` and canonical
 * interaction combinations live in `src/components/molecules`. This barrel
 * remains intentionally stable while domain surfaces migrate incrementally;
 * it must re-export canonical equivalents where the interaction contract is
 * shared instead of becoming a second design-system implementation.
 *
 * Use this layer only for genuinely composable Radix primitives that do not
 * have an equivalent canonical atom or molecule yet.
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
