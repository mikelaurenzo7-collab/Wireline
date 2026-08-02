import { Save, Loader2 } from "lucide-react";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { OPS_ADMIN } from "../../lib/wireline-ops-design";
import { cn } from "../../lib/utils";

type AdminSaveBarProps = {
  onClick: () => void;
  isSaving: boolean;
  label: string;
  className?: string;
  fullWidth?: boolean;
};

/** Shared save footer for admin settings panels. */
export function AdminSaveBar({
  onClick,
  isSaving,
  label,
  className,
  fullWidth,
}: AdminSaveBarProps) {
  return (
    <div className={cn("", className)}>
      <ShadButton
        onClick={onClick}
        disabled={isSaving}
        variant="outline"
        className={cn(
          "app-primary-action disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2",
          fullWidth && "w-full md:w-auto",
        )}
      >
        {isSaving ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        ) : (
          <Save className="w-4 h-4" aria-hidden />
        )}
        {isSaving ? OPS_ADMIN.saving : label}
      </ShadButton>
    </div>
  );
}
