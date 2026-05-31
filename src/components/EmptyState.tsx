import { LucideIcon } from "lucide-react";
import { EmptyState as UiEmptyState } from "./ui/EmptyState";

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
  /** Eyebrow label above the title. Defaults to the canonical "No data yet". */
  eyebrow?: string;
}

/**
 * EmptyState — compatibility shim that delegates to the canonical Aurora Cream
 * {@link UiEmptyState} primitive (`components/ui/EmptyState`). Kept so existing
 * imports keep working while every empty surface renders the single, unified,
 * gem-like pattern. New code should import from `components/ui/EmptyState`.
 */
export default function EmptyState({
  icon,
  title,
  description,
  actions = [],
  accent,
  className,
  eyebrow,
}: Props) {
  return (
    <UiEmptyState
      icon={icon}
      title={title}
      description={description}
      actions={actions}
      accent={accent}
      className={className}
      eyebrow={eyebrow}
    />
  );
}
