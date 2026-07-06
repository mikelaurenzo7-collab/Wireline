import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Medallion } from "./Medallion";
import { SectionHeader } from "./SectionHeader";
import { Button } from "../atoms";

import { SignalOrbFrame } from "./SignalOrbFrame";

interface Action {
  label: string;
  to?: string;
  onClick?: () => void;
  primary?: boolean;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: Action[];
  className?: string;
  /** Soft bloom behind the medallion */
  withHalo?: boolean;
  /** Minimal frame behind the medallion (off in compact panels) */
  withConstellation?: boolean;
  /** Eyebrow label above the title. Defaults to the canonical "No data yet". */
  eyebrow?: string;
  /** Optional accent override (hex/rgb) tinting the medallion. */
  accent?: string;
  /**
   * Wrap the empty state in the canonical premium panel chrome
   * (wl-panel-elevated) so insights / dashboard panels share a single primitive.
   */
  framed?: boolean;
  /**
   * Center the empty state in its available vertical space (min 55vh) so a
   * full-page / full-tab empty doesn't cling to the top of the viewport with a
   * large dead void below it. Opt-in: only the sole-content empties should fill.
   */
  fill?: boolean;
  /** compact = embedded panels with less vertical padding */
  density?: "default" | "compact";
  /** Optional slot between description and action buttons (task grids, hints). */
  children?: ReactNode;
}

/**
 * EmptyState — canonical empty / idle / no-data pattern for authenticated surfaces.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
  className,
  withHalo = true,
  withConstellation,
  eyebrow,
  accent,
  framed = false,
  fill = false,
  density = "default",
  children,
}: EmptyStateProps) {
  const reduceMotion = useReducedMotion();
  const compact = density === "compact";
  const showConstellation = withConstellation ?? framed;

  const body = (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "wl-empty-state flex flex-col items-center justify-center text-center px-6",
        compact ? "py-8" : "py-12",
        framed && "py-0",
        className,
      )}
    >
      <div className={compact ? "mb-4" : "mb-5"}>
        <SignalOrbFrame
          size={compact ? "sm" : "md"}
          withConstellation={showConstellation}
          withBloom={withHalo}
          refined
        >
          <Medallion
            variant="instrument"
            withHalo={false}
            size={compact ? "sm" : "md"}
            accent={accent}
          >
            <Icon className={compact ? "w-5 h-5" : "w-6 h-6"} strokeWidth={1.75} />
          </Medallion>
        </SignalOrbFrame>
      </div>

      <SectionHeader
        tone="instrument"
        eyebrow={eyebrow}
        title={title}
        description={description}
        className="max-w-sm"
        divider={false}
      />

      {children ? <div className="mt-6 w-full max-w-lg">{children}</div> : null}

      {actions.length > 0 && (
        <div
          className={cn(
            "flex flex-col sm:flex-row flex-wrap justify-center items-stretch sm:items-center gap-2 w-full max-w-full",
            compact ? "mt-4" : "mt-6",
          )}
        >
          {actions.map((action, index) => {
            const isPrimary = !!action.primary;

            const primaryTextStyle = isPrimary
              ? { color: "var(--wireline-color-text-onAction)" }
              : undefined;

            if (action.to) {
              const internal = action.to.startsWith("/") && !action.to.startsWith("//");
              return (
                <Button
                  key={index}
                  asChild
                  variant={isPrimary ? "default" : "outline"}
                  style={primaryTextStyle}
                  className={cn(
                    "rounded-full touch-press w-full sm:w-auto justify-center",
                    isPrimary && "app-primary-action",
                    isPrimary &&
                      compact &&
                      "!normal-case !tracking-normal !text-[var(--wireline-typography-overline-size)] !font-semibold",
                    !isPrimary && "border-brand/20 text-foreground/85 hover:bg-brand/[0.04]",
                    !isPrimary &&
                      compact &&
                      "normal-case tracking-normal text-[var(--wireline-typography-overline-size)] font-medium",
                  )}
                >
                  {internal ? (
                    <Link to={action.to} className="text-center">
                      {action.label}
                    </Link>
                  ) : (
                    <a href={action.to}>{action.label}</a>
                  )}
                </Button>
              );
            }

            return (
              <Button
                key={index}
                onClick={action.onClick}
                variant={isPrimary ? "default" : "outline"}
                style={primaryTextStyle}
                className={cn(
                  "rounded-full touch-press w-full sm:w-auto justify-center",
                  isPrimary && "app-primary-action",
                  isPrimary &&
                    compact &&
                    "!normal-case !tracking-normal !text-[var(--wireline-typography-overline-size)] !font-semibold",
                  !isPrimary && "border-brand/20 text-foreground/85 hover:bg-brand/[0.04]",
                  !isPrimary &&
                    compact &&
                    "normal-case tracking-normal text-[var(--wireline-typography-overline-size)] font-medium",
                )}
              >
                {action.label}
              </Button>
            );
          })}
        </div>
      )}
    </motion.div>
  );

  const content = !framed ? (
    body
  ) : (
    <div
      className={cn(
        WL_APP_CLASSES.panelFrame,
        "p-10 md:p-14 flex flex-col items-center text-center",
      )}
    >
      {body}
    </div>
  );

  if (!fill) return content;

  // Center the empty surface within its available vertical space so full-page
  // empties read as balanced rather than top-glued with a large void beneath.
  // `flex-1` fills the parent when it's a height-bearing flex column (the
  // desktop console layout); `min-h-[75vh]` is the floor that guarantees the
  // same centered balance on mobile, where that flex height chain collapses
  // and `flex-1`/`h-full` would otherwise resolve to zero. Together they fix
  // mobile without regressing the desktop centering.
  return <div className="flex flex-1 flex-col w-full min-h-[75vh] justify-center">{content}</div>;
}
