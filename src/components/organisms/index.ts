/**
 * Canonical route-level interface sections.
 *
 * Existing implementation locations remain stable during migration, while new
 * route work imports organisms from this barrel rather than reconstructing page
 * shells, workspace command behavior, or bounded panels ad hoc.
 */
export { default as CommandBar } from "../CommandBar";
export { default as PageShell, Panel, StatTile } from "../PageShell";
export type { PageShellTab } from "../PageShell";
