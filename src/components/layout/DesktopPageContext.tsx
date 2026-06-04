import { cn } from "../../lib/utils";
import { WL_APP_CLASSES } from "../../lib/wireline-director-design";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
};

/**
 * lg+ page context — eyebrow, title, and route subtitle in the cream workspace.
 * TopBar keeps compact breadcrumb; this block gives operators full hierarchy.
 */
export default function DesktopPageContext({ eyebrow, title, subtitle, className }: Props) {
  if (!title && !subtitle) return null;

  return (
    <header className={cn("hidden lg:block shrink-0", WL_APP_CLASSES.pageContext, className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="wl-label text-brand/70 mb-1">{eyebrow}</p>}
          <h1 className="font-display italic text-[1.65rem] leading-[1.05] tracking-[-0.02em] text-ink text-balance">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-[13px] leading-snug text-muted max-w-2xl text-pretty">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 aurora-divider" aria-hidden="true" />
    </header>
  );
}
