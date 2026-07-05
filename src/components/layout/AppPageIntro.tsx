import type { ReactNode } from "react";
import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";

import { cn } from "../../lib/utils";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../atoms";

interface AppPageIntroProps {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * In-app page header when a route does not use WorkspaceShell.
 * Desktop exposes actions inline; mobile uses the canonical Dialog drawer instead of a bespoke sheet.
 */
export default function AppPageIntro({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: AppPageIntroProps) {
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  return (
    <Dialog open={mobileActionsOpen} onOpenChange={setMobileActionsOpen}>
      <div
        className={cn(
          "flex flex-col justify-between gap-4 border-b border-border pb-5 md:flex-row md:items-start md:pb-8",
          className,
        )}
      >
        <div className="w-full min-w-0 max-w-3xl flex-1 text-left">
          {eyebrow ? <p className="wl-overline mb-2">{eyebrow}</p> : null}
          <h1 className="wl-page-title text-balance">{title}</h1>
          {subtitle ? <div className="wl-page-copy mt-3 text-pretty">{subtitle}</div> : null}
        </div>
        {actions ? (
          <div className="mt-1 flex shrink-0 flex-wrap items-center gap-2 md:mt-0 md:justify-end">
            <div className="hidden flex-wrap items-center gap-3 md:flex">{actions}</div>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Open page actions"
                aria-controls="wireline-page-actions"
                className="md:hidden"
              >
                <MoreHorizontal className="size-5" aria-hidden="true" />
              </Button>
            </DialogTrigger>
          </div>
        ) : null}
      </div>

      {actions ? (
        <DialogContent
          id="wireline-page-actions"
          presentation="drawer"
          showClose={false}
          aria-label="Page actions"
          overlayClassName="bg-[var(--wireline-color-overlay-scrim)]"
          className="md:hidden"
        >
          <DialogTitle className="sr-only">Page actions</DialogTitle>
          <DialogDescription className="sr-only">
            Actions available for the current page.
          </DialogDescription>

          <div className="mx-auto w-full max-w-lg px-4 pb-4 pt-3">
            <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="wl-overline">Actions</p>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Close page actions">
                  <X className="size-5" aria-hidden="true" />
                </Button>
              </DialogClose>
            </div>
            <div className="flex flex-col gap-2 [&_a]:min-h-[48px] [&_button]:min-h-[48px]">
              {actions}
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
