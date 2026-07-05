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

type ClientToolbarProps = {
  left?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/**
 * Compact action row when the route chrome owns page context.
 * Desktop exposes actions inline; mobile progressively discloses them in the canonical Dialog drawer.
 */
export default function ClientToolbar({ left, actions, className }: ClientToolbarProps) {
  const [open, setOpen] = useState(false);

  if (!left && !actions) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "mb-2 flex min-h-10 shrink-0 items-center justify-between gap-3 md:mb-3",
          className,
        )}
      >
        {left && <div className="min-w-0 flex-1">{left}</div>}
        {actions ? (
          <>
            <div className="hidden shrink-0 items-center justify-end gap-2 md:flex">{actions}</div>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Open page actions"
                aria-controls="wireline-toolbar-actions"
                className="shrink-0 md:hidden"
              >
                <MoreHorizontal className="size-5" aria-hidden="true" />
              </Button>
            </DialogTrigger>
          </>
        ) : null}
      </div>

      {actions ? (
        <DialogContent
          id="wireline-toolbar-actions"
          presentation="drawer"
          showClose={false}
          aria-label="Page actions"
          overlayClassName="bg-[var(--wireline-color-overlay-scrim)]"
        >
          <DialogTitle className="sr-only">Page actions</DialogTitle>
          <DialogDescription className="sr-only">
            Actions available for the current page.
          </DialogDescription>

          <div className="mx-auto w-full max-w-lg px-4 pb-4 pt-3">
            <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-eyebrow">Page actions</p>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Close page actions">
                  <X className="size-5" aria-hidden="true" />
                </Button>
              </DialogClose>
            </div>
            <div className="flex flex-col gap-2">{actions}</div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
