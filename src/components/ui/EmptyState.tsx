import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Medallion } from "./Medallion";
import { SectionHeader } from "./SectionHeader";
import { ShadButton } from "./shadcn/ShadButton";
import { WL_APP_CLASSES } from "../../lib/wireline-director-design";

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
  /** Show the signature brand halo behind the medallion */
  withHalo?: boolean;
  /** Eyebrow label above the title. Defaults to the canonical "No data yet". */
  eyebrow?: string;
  /** Optional accent override (hex/rgb) tinting the medallion + halo. */
  accent?: string;
  /**
   * Wrap the empty state in the canonical premium panel chrome
   * (wl-panel-elevated) so insights / dashboard panels share a single primitive.
   */
  framed?: boolean;
  /** compact = embedded panels with less vertical padding */
  density?: "default" | "compact";
  /** Optional slot between description and action buttons (task grids, hints). */
  children?: ReactNode;
}

/**
 * EmptyState — the canonical empty / idle / no-data pattern for the Aurora Cream system.
 * Use this everywhere instead of ad-hoc empty states.
 *
 * The medallion floats gently and catches a crystalline glint so every empty
 * surface in the authenticated app shares the same gem-like, high-class aura
 * as the public marketing pages.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
  className,
  withHalo = true,
  eyebrow = "No data yet",
  accent,
  framed = false,
  density = "default",
  children,
}: EmptyStateProps) {
  const reduceMotion = useReducedMotion();
  const compact = density === "compact";

  const body = (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "wl-empty-state flex flex-col items-center justify-center text-center px-6",
        compact ? "py-8" : "py-12",
        framed && "py-0",
        className,
      )}
    >
      <motion.div
        animate={reduceMotion || compact ? undefined : { y: [0, -4, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        className={compact ? "mb-4" : "mb-5"}
      >
        <Medallion withHalo={withHalo} size={compact ? "sm" : "md"} accent={accent}>
          <Icon className={compact ? "w-5 h-5" : "w-6 h-6"} />
        </Medallion>
      </motion.div>

      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        className="max-w-sm"
      />

      {children ? <div className="mt-6 w-full max-w-lg">{children}</div> : null}

      {actions.length > 0 && (
        <div className={cn("flex flex-wrap justify-center gap-2", compact ? "mt-4" : "mt-6")}>
          {actions.map((action, index) => {
            const isPrimary = !!action.primary;
            const sharedClasses = cn(
              "rounded-full transition-all",
              isPrimary
                ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/20 hover:shadow-md hover:shadow-brand/25 hover:-translate-y-px"
                : "hover:-translate-y-px",
            );

            if (action.to) {
              const internal = action.to.startsWith("/") && !action.to.startsWith("//");
              return (
                <ShadButton
                  key={index}
                  asChild
                  variant={isPrimary ? "default" : "outline"}
                  className={sharedClasses}
                >
                  {internal ? (
                    <Link to={action.to}>{action.label}</Link>
                  ) : (
                    <a href={action.to}>{action.label}</a>
                  )}
                </ShadButton>
              );
            }

            return (
              <ShadButton
                key={index}
                onClick={action.onClick}
                variant={isPrimary ? "default" : "outline"}
                className={sharedClasses}
              >
                {action.label}
              </ShadButton>
            );
          })}
        </div>
      )}
    </motion.div>
  );

  if (!framed) return body;

  return (
    <div
      className={cn(
        WL_APP_CLASSES.panelFrame,
        "p-10 md:p-14 flex flex-col items-center text-center",
      )}
    >
      {body}
    </div>
  );
}
