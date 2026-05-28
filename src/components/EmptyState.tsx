import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

interface Action {
  label: string;
  to?: string;
  onClick?: () => void;
  primary?: boolean;
}

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: Action[];
  accent?: string;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
  accent,
  className,
}: Props) {
  // Resolve the brand accent at runtime so palette changes propagate
  // without touching component code. SSR-safe fallback to brand purple.
  const resolvedAccent =
    accent ??
    (typeof window !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--color-brand").trim() ||
        "#4F1E7B"
      : "#4F1E7B");
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col items-center justify-center gap-5 py-12 sm:py-16 px-5 sm:px-6 text-center",
        className,
      )}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: `${resolvedAccent}15`, border: `1px solid ${resolvedAccent}30` }}
        >
          <Icon className="w-7 h-7" style={{ color: resolvedAccent }} strokeWidth={1.5} />
        </motion.div>
      </motion.div>
      <div className="max-w-xs">
        <h3 className="font-display italic text-xl sm:text-2xl text-ink mb-2 text-balance">
          {title}
        </h3>
        <p className="text-caption max-w-sm mx-auto">{description}</p>
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-3 justify-center mt-1">
          {actions.map((action, i) =>
            action.to ? (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
              >
                <Link
                  to={action.to}
                  className={cn(
                    "px-4 py-2.5 rounded-full text-eyebrow tracking-[0.2em] transition-all",
                    action.primary
                      ? "brutal-btn !py-2"
                      : "glass border border-white/10 text-muted hover:text-ink hover:border-brand/30",
                  )}
                >
                  {action.label}
                </Link>
              </motion.div>
            ) : (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
              >
                <button
                  onClick={action.onClick}
                  className={cn(
                    "px-4 py-2.5 rounded-full text-eyebrow tracking-[0.2em] transition-all",
                    action.primary
                      ? "brutal-btn !py-2"
                      : "glass border border-white/10 text-muted hover:text-ink hover:border-brand/30",
                  )}
                >
                  {action.label}
                </button>
              </motion.div>
            ),
          )}
        </div>
      )}
    </motion.div>
  );
}
