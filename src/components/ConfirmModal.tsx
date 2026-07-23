import type { MouseEvent } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "../lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./ui/shadcn/AlertDialog";
import { ShadButton } from "./ui/shadcn/ShadButton";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        if (!nextOpen && !loading) onCancel();
      }}
    >
      <AlertDialogContent
        aria-busy={loading}
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
        className="p-0"
      >
        <div className="relative rounded-t-md sm:rounded-md wl-panel-elevated p-6 overflow-hidden">
          <div className="sm:hidden flex justify-center -mt-1 mb-3">
            <div className="w-9 h-1 rounded-full bg-ink/15" aria-hidden="true" />
          </div>

          <div className="relative z-10 flex items-start gap-4 mb-5">
            <div
              className={cn(
                "w-10 h-10 rounded-md flex items-center justify-center shrink-0",
                danger
                  ? "bg-rose-500/15 border border-rose-500/30"
                  : "bg-brand/15 border border-brand/30",
              )}
            >
              <AlertTriangle
                className={cn("w-5 h-5", danger ? "text-rose-500" : "text-brand")}
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0 flex-1">
              <AlertDialogTitle id="confirm-modal-title" className="mb-1">
                {title}
              </AlertDialogTitle>
              <AlertDialogDescription id="confirm-modal-desc">{message}</AlertDialogDescription>
            </div>
            <AlertDialogCancel asChild disabled={loading}>
              <ShadButton
                variant="ghost"
                size="icon"
                aria-label="Close dialog"
                className="ml-auto w-11 h-11 sm:w-8 sm:h-8 -m-1.5 sm:m-0 rounded-full shrink-0 touch-press hover:scale-[1.05]"
              >
                <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
              </ShadButton>
            </AlertDialogCancel>
          </div>

          <div className="relative z-10 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <AlertDialogCancel asChild disabled={loading}>
              <ShadButton
                variant="outline"
                disableAnimations
                className="flex-1 h-11 rounded-md text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.25em] touch-press hover:scale-[1.02]"
              >
                {cancelLabel}
              </ShadButton>
            </AlertDialogCancel>
            <AlertDialogAction
              asChild
              disabled={loading}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                onConfirm();
              }}
            >
              <ShadButton
                variant={danger ? "destructive" : "editorial"}
                disableAnimations
                className={cn(
                  "flex-1 h-11 rounded-md text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.25em] touch-press-deep hover:scale-[1.02]",
                  !danger && "!py-0",
                )}
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                {confirmLabel}
              </ShadButton>
            </AlertDialogAction>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
