/**
 * Director composer tool rail — pill chips with bottom-rail active state.
 */
import type { ReactNode } from "react";
import { ChevronDown, Loader2, Paperclip, Plug, Sparkles, Bot, Wrench } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import {
  WL_DIRECTOR_CLASSES,
  type ComposerAccessoryKind,
} from "../../lib/wireline-director-design";

type ToolChipProps = {
  id: ComposerAccessoryKind;
  label: string;
  shortLabel?: string;
  icon: ReactNode;
  active: boolean;
  engaged?: boolean;
  disabled?: boolean;
  onClick: () => void;
  "aria-label"?: string;
  trailing?: ReactNode;
};

function ComposerToolChip({
  id,
  label,
  shortLabel,
  icon,
  active,
  engaged,
  disabled,
  onClick,
  "aria-label": ariaLabel,
  trailing,
}: ToolChipProps) {
  return (
    <ShadButton
      type="button"
      variant="ghost"
      size="sm"
      disableAnimations
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      aria-expanded={active}
      aria-controls={`director-composer-accessory-${id}`}
      aria-label={ariaLabel ?? label}
      className={cn(
        WL_DIRECTOR_CLASSES.composerToolChip,
        active && WL_DIRECTOR_CLASSES.composerToolChipActive,
        engaged && !active && WL_DIRECTOR_CLASSES.composerToolChipEngaged,
        "h-auto touch-press rounded-full shadow-none",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel ?? label}</span>
      {trailing}
      <ChevronDown
        className={cn(
          "w-3 h-3 opacity-60 transition-transform",
          active && "rotate-180 opacity-100",
        )}
        aria-hidden
      />
    </ShadButton>
  );
}

export interface DirectorComposerToolbarProps {
  activeAccessory: ComposerAccessoryKind | null;
  onToggle: (kind: ComposerAccessoryKind) => void;
  focusAgentId: string | null;
  focusedAgentName?: string;
  enabledToolsCount: number;
  isUploading: boolean;
  isSending: boolean;
}

export function DirectorComposerToolbar({
  activeAccessory,
  onToggle,
  focusAgentId,
  focusedAgentName,
  enabledToolsCount,
  isUploading,
  isSending,
}: DirectorComposerToolbarProps) {
  return (
    <div className={WL_DIRECTOR_CLASSES.composerToolbar}>
      <ComposerToolChip
        id="connectors"
        label="Connectors"
        shortLabel="Links"
        icon={<Plug className="w-3.5 h-3.5 shrink-0" />}
        active={activeAccessory === "connectors"}
        onClick={() => onToggle("connectors")}
      />
      <ComposerToolChip
        id="capabilities"
        label="Capabilities"
        shortLabel="Skills"
        icon={<Sparkles className="w-3.5 h-3.5 shrink-0" />}
        active={activeAccessory === "capabilities"}
        onClick={() => onToggle("capabilities")}
      />
      <ComposerToolChip
        id="coach"
        label={focusedAgentName ?? "Coach"}
        shortLabel="Coach"
        icon={<Bot className="w-3.5 h-3.5 shrink-0" />}
        active={activeAccessory === "coach"}
        engaged={Boolean(focusAgentId)}
        onClick={() => onToggle("coach")}
        aria-label={focusedAgentName ? `Coach ${focusedAgentName}` : "Coach agent"}
      />
      {focusAgentId && (
        <ComposerToolChip
          id="tools"
          label="Abilities"
          shortLabel="Tools"
          icon={<Wrench className="w-3.5 h-3.5 shrink-0" />}
          active={activeAccessory === "tools"}
          onClick={() => onToggle("tools")}
          trailing={
            enabledToolsCount > 0 ? (
              <span className="font-mono text-[9px] tabular-nums opacity-70">
                ({enabledToolsCount})
              </span>
            ) : null
          }
        />
      )}
      <ComposerToolChip
        id="attach"
        label="Attach"
        shortLabel="Attach"
        icon={
          isUploading ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-brand" />
          ) : (
            <Paperclip className="w-3.5 h-3.5 shrink-0" />
          )
        }
        active={activeAccessory === "attach"}
        disabled={isUploading || isSending}
        onClick={() => onToggle("attach")}
      />
    </div>
  );
}
