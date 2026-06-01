import { motion, useReducedMotion } from "motion/react";
import { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Medallion } from "./Medallion";
import { SectionHeader } from "./SectionHeader";
import { ShadButton } from "./shadcn/ShadButton";

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
   * (aurora-ring + glass-strong) so insights / dashboard panels share
   * a single primitive instead of re-creating the gem frame ad-hoc.
   */
  framed?: boolean;
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
}: EmptyStateProps) {
  const reduceMotion = useReducedMotion();

  const body = (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center px-6",
        framed && "py-0",
        className,
      )}
    >
      <motion.div
        animate={reduceMotion ? undefined : { y: [0, -4, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        className="mb-5"
      >
        <Medallion withHalo={withHalo} size="md" accent={accent}>
          <Icon className="w-6 h-6" />
        </Medallion>
      </motion.div>

      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        className="max-w-sm"
      />

      {actions.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {actions.map((action, index) => {
            const isPrimary = !!action.primary;
            const sharedClasses = cn(
              "rounded-xl",
              isPrimary &&
                "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/20 hover:opacity-95",
            );

            if (action.to) {
              return (
                <ShadButton
                  key={index}
                  asChild
                  variant={isPrimary ? "default" : "glass"}
                  className={sharedClasses}
                >
                  <a href={action.to}>{action.label}</a>
                </ShadButton>
              );
            }

            return (
              <ShadButton
                key={index}
                onClick={action.onClick}
                variant={isPrimary ? "default" : "glass"}
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
    <div className="relative aurora-ring rounded-3xl">
      <div className="relative rounded-3xl glass-strong border border-black/8 overflow-hidden p-10 md:p-14 flex flex-col items-center text-center">
        {body}
      </div>
    </div>
  );
}
