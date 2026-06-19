import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  lede?: string;
  actions?: ReactNode;
};

/** Console page title — one line, optional short lede, no eyebrow spam. */
export function PageHeader({ title, lede, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[1.625rem] font-semibold tracking-[-0.03em] text-foreground sm:text-[1.875rem]">
          {title}
        </h1>
        {lede ? (
          <p className="mt-1 max-w-lg text-sm leading-5 text-muted-foreground">{lede}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
