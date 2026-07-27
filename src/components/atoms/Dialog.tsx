import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const dialogContentVariants = cva(
  "fixed grid duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  {
    variants: {
      presentation: {
        modal:
          "wl-panel glass-xl left-[50%] top-[50%] z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-5 overflow-y-auto overscroll-contain rounded-xl border p-5 shadow-[var(--wireline-elevation-lg)] data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:p-6",
        navigation:
          "inset-x-0 bottom-0 top-16 z-[70] w-auto max-w-none gap-0 overflow-y-auto rounded-none border-x-0 border-b-0 border-t border-border bg-[var(--wireline-color-canvas-default)] p-0 shadow-none data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-top-0",
        drawer:
          "inset-x-0 bottom-0 z-[70] max-h-[min(70dvh,40rem)] w-auto max-w-none gap-0 overflow-y-auto rounded-t-[var(--radius-xl)] border border-b-0 border-x-0 border-border bg-[var(--wireline-color-surface-default)] p-0 pb-[env(safe-area-inset-bottom)] shadow-[var(--wireline-elevation-lg)] data-[state=closed]:slide-out-to-bottom-0 data-[state=open]:slide-in-from-bottom-0",
        sidebar:
          "inset-y-0 left-0 z-[70] h-[100dvh] w-[min(84vw,20rem)] max-w-none gap-0 overflow-y-auto rounded-none border-y-0 border-l-0 border-r border-border bg-[var(--wireline-color-surface-default)] p-0 pb-[env(safe-area-inset-bottom)] shadow-[18px_0_44px_-28px_rgba(17,17,17,0.34)] data-[state=closed]:slide-out-to-left-0 data-[state=open]:slide-in-from-left-0",
      },
    },
    defaultVariants: {
      presentation: "modal",
    },
  },
);

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> &
  VariantProps<typeof dialogContentVariants> & {
    /** Allows a route-level dialog to tune its backdrop without reimplementing portal behavior. */
    overlayClassName?: string;
    /** Use a route-owned close control when a modal has persistent chrome. */
    showClose?: boolean;
  };

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, overlayClassName, presentation, showClose = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      data-slot="dialog-content"
      data-presentation={presentation ?? "modal"}
      className={cn(dialogContentVariants({ presentation }), className)}
      {...props}
    >
      {children}
      {showClose ? (
        <DialogPrimitive.Close className="absolute right-2 top-2 grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn("flex flex-col space-y-2 text-left", className)}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="dialog-title"
    className={cn(
      "break-words pr-14 text-left font-[var(--wireline-font-family-display)] text-xl font-semibold leading-[1.15] tracking-[-.025em] text-foreground",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="dialog-description"
    className={cn(
      "max-w-prose break-words text-left text-[15px] leading-6 text-[var(--wireline-color-text-secondary)]",
      className,
    )}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogOverlay,
  DialogPortal,
};