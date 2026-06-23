import { Briefcase, User } from "lucide-react";
import { PRODUCT_POSTURE } from "../../lib/product-copy";
import { cn } from "../../lib/utils";

export default function PostureBadge({
  isBusiness,
  compact = false,
  className,
}: {
  isBusiness: boolean;
  compact?: boolean;
  className?: string;
}) {
  const posture = isBusiness ? PRODUCT_POSTURE.business : PRODUCT_POSTURE.personal;
  const label = compact ? posture.badgeShort : posture.badge;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold",
        isBusiness ? "bg-accent text-primary" : "bg-secondary text-foreground",
        className,
      )}
      title={posture.badge}
    >
      {isBusiness ? (
        <Briefcase size={10} aria-hidden />
      ) : (
        <User size={10} className="text-primary" aria-hidden />
      )}
      {label}
    </span>
  );
}