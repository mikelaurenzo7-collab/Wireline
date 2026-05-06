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
  accent = "#7DF9FF",
  className,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex flex-col items-center justify-center gap-5 py-16 px-6 text-center", className)}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}
      >
        <Icon className="w-7 h-7" style={{ color: accent }} strokeWidth={1.5} />
      </div>
      <div className="max-w-xs">
        <h3 className="font-display italic text-2xl text-ink mb-2">{title}</h3>
        <p className="text-xs text-muted leading-relaxed">{description}</p>
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-3 justify-center mt-1">
          {actions.map((action) =>
            action.to ? (
              <Link
                key={action.label}
                to={action.to}
                className={cn(
                  "px-4 py-2 rounded-full text-[11px] uppercase tracking-[0.25em] transition-all",
                  action.primary
                    ? "brutal-btn !py-2"
                    : "glass border border-white/10 text-muted hover:text-ink hover:border-brand/30"
                )}
              >
                {action.label}
              </Link>
            ) : (
              <button
                key={action.label}
                onClick={action.onClick}
                className={cn(
                  "px-4 py-2 rounded-full text-[11px] uppercase tracking-[0.25em] transition-all",
                  action.primary
                    ? "brutal-btn !py-2"
                    : "glass border border-white/10 text-muted hover:text-ink hover:border-brand/30"
                )}
              >
                {action.label}
              </button>
            )
          )}
        </div>
      )}
    </motion.div>
  );
}
