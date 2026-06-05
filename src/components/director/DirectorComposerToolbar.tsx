/**
 * Director composer tool rail — pill chips with bottom-rail active state.
 * 
 * Cycle 8 improvements: Stronger focus visibility, better contrast on active/engaged states,
 * and improved accessibility for daily operator use.
 */
import type { ReactNode } from "react";
import { Brain, ChevronDown, Loader2, Paperclip, Plug, Sparkles, Bot, Wrench } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import {
  WL_DIRECTOR_CLASSES,
  DIRECTOR_COMPOSER_CONTEXT,
  DIRECTOR_DEEP_MODE_COPY,
  type ComposerAccessoryKind,
} from "../../lib/wireline-director-design";
import { DirectorModelPicker } from "./DirectorModelPicker";
import type { DirectorChatModelSelection } from "../../lib/director-model-selection";

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
  showChevron?: boolean;
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
  showChevron = true,
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
      aria-controls={active ? `director-composer-accessory-${id}` : undefined}
      aria-label={ariaLabel ?? label}
      className={cn(
        WL_DIRECTOR_CLASSES.composerToolChip,
        "focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active && WL_DIRECTOR_CLASSES.composerToolChipActive,
        engaged && !active && WL_DIRECTOR_CLASSES.composerToolChipEngaged,
        "h-auto touch-press rounded-full shadow-none",
      )}
    >
      {icon}
      <span className={cn("hidden sm:inline", id === "coach" && "wl-composer-tool-chip-label")}>
        {label}
      </span>
      <span className="sm:hidden">{shortLabel ?? label}</span>
      {trailing}
      {showChevron && (
        <ChevronDown
          className={cn(
            "w-3 h-3 opacity-60 transition-transform",
            active && "rotate-180 opacity-100",
          )}
          aria-hidden
        />
      )}
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
  forceDeep?: boolean;
  onToggleForceDeep?: () => void;
  chatModelSelection?: DirectorChatModelSelection;
  onChatModelChange?: (next: DirectorChatModelSelection) => void;
}

export function DirectorComposerToolbar({
  activeAccessory,
  onToggle,
  focusAgentId,
  focusedAgentName,
  enabledToolsCount,
  isUploading,
  isSending,
  forceDeep = false,
  onToggleForceDeep,
  chatModelSelection,
  onChatModelChange,
}: DirectorComposerToolbarProps) {
  const showDeepToggle =
    !focusAgentId && onToggleForceDeep && chatModelSelection?.provider !== "openrouter";

  return (
    <div className={WL_DIRECTOR_CLASSES.composerToolbarScroll}>
      <div
        role="toolbar"
        aria-label={DIRECTOR_COMPOSER_CONTEXT.toolbarLabel}
        className={WL_DIRECTOR_CLASSES.composerToolbar}
      >
        {chatModelSelection && onChatModelChange ? (
          <DirectorModelPicker
            selection={chatModelSelection}
            onChange={onChatModelChange}
            disabled={isSending}
          ) : null}
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
              ) : null}
            }
          />
        )}
        {showDeepToggle && (
          <ShadButton
            type="button"
            variant="ghost"
            size="sm"
            disableAnimations
            disabled={isSending}
            onClick={onToggleForceDeep}
            aria-pressed={forceDeep}
            aria-label={DIRECTOR_DEEP_MODE_COPY.hint}
            title={DIRECTOR_DEEP_MODE_COPY.hint}
            className={cn(
              WL_DIRECTOR_CLASSES.composerToolChip,
              "focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              forceDeep && WL_DIRECTOR_CLASSES.composerToolChipActive,
              "h-auto touch-press rounded-full shadow-none",
            )}
          >
            <Brain className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{DIRECTOR_DEEP_MODE_COPY.label}</span>
            <span className="sm:hidden">{DIRECTOR_DEEP_MODE_COPY.shortLabel}</span>
          </ShadButton>
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
    </div>
  );
}
