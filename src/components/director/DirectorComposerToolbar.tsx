/**
 * Director composer tool rail — pill chips with bottom-rail active state.
 *
 * World-class visual design standards (Cycle 11):
 * - Refined active/engaged states with better elevation and depth
 * - Premium focus treatment
 * - Improved visual rhythm and hierarchy
 * - Consistent with Aurora Cream design language
 */
import type { ReactNode } from "react";
import {
  Brain,
  Bot,
  ChevronDown,
  Loader2,
  Palette,
  Paperclip,
  Plug,
  Sparkles,
  SwatchBook,
  Wrench,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import {
  WL_DIRECTOR_CLASSES,
  DIRECTOR_COMPOSER_CONTEXT,
  DIRECTOR_DEEP_MODE_COPY,
  WIRELINE_STITCH_UI,
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
        "transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] hover:bg-brand/5 hover:border-brand/20",
        active &&
          cn(
            WL_DIRECTOR_CLASSES.composerToolChipActive,
            "shadow-sm ring-1 ring-brand/30 bg-brand/10 hover:bg-brand/15",
          ),
        engaged &&
          !active &&
          cn(
            WL_DIRECTOR_CLASSES.composerToolChipEngaged,
            "ring-1 ring-brand/25 bg-brand/5 hover:bg-brand/8",
          ),
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
            "w-3 h-3 opacity-60 transition-transform duration-200",
            active && "rotate-180 opacity-100",
          )}
          aria-hidden
        />
      )}
    </ShadButton>
  );
}

export type DirectorComposerSurface = "director" | "painter";

export interface DirectorComposerToolbarProps {
  surface?: DirectorComposerSurface;
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
  designStudioEnabled?: boolean;
  /** @deprecated Use designStudioEnabled */
  stitchMediaEnabled?: boolean;
  designMode?: boolean;
  onToggleDesignMode?: () => void;
  useStitchAccountBranding?: boolean;
  onToggleStitchAccountBranding?: () => void;
  stitchBrandingAvailable?: boolean;
  designProfileConfigured?: boolean;
}

export function DirectorComposerToolbar({
  surface = "director",
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
  designStudioEnabled,
  stitchMediaEnabled,
  designMode = false,
  onToggleDesignMode: _onToggleDesignMode,
  useStitchAccountBranding = true,
  onToggleStitchAccountBranding,
  stitchBrandingAvailable = false,
  designProfileConfigured = false,
}: DirectorComposerToolbarProps) {
  const isPainterSurface = surface === "painter";
  const designStudioOn = designStudioEnabled ?? stitchMediaEnabled ?? false;
  const showDeepToggle =
    !isPainterSurface &&
    !focusAgentId &&
    !designMode &&
    onToggleForceDeep &&
    chatModelSelection?.provider !== "openrouter";
  const showStitchBrandingToggle =
    designMode && designStudioOn && onToggleStitchAccountBranding && stitchBrandingAvailable;

  return (
    <div className={WL_DIRECTOR_CLASSES.composerToolbarScroll}>
      <div
        role="toolbar"
        aria-label={DIRECTOR_COMPOSER_CONTEXT.toolbarLabel}
        className={WL_DIRECTOR_CLASSES.composerToolbar}
      >
        {!isPainterSurface && chatModelSelection && onChatModelChange ? (
          <DirectorModelPicker
            selection={chatModelSelection}
            onChange={onChatModelChange}
            disabled={isSending}
          />
        ) : null}
        {!isPainterSurface ? (
          <>
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
            {focusAgentId ? (
              <ComposerToolChip
                id="tools"
                label="Abilities"
                shortLabel="Tools"
                icon={<Wrench className="w-3.5 h-3.5 shrink-0" />}
                active={activeAccessory === "tools"}
                onClick={() => onToggle("tools")}
                trailing={
                  enabledToolsCount > 0 ? (
                    <span className="font-mono wl-micro-badge tabular-nums opacity-70">
                      ({enabledToolsCount})
                    </span>
                  ) : null
                }
              />
            ) : null}
          </>
        ) : null}
        {(isPainterSurface || designMode) && designStudioOn && (
          <ComposerToolChip
            id="designSetup"
            label={WIRELINE_STITCH_UI.designSystemSetupLabel}
            shortLabel={WIRELINE_STITCH_UI.designSystemSetupShortLabel}
            icon={<SwatchBook className="w-3.5 h-3.5 shrink-0" />}
            active={activeAccessory === "designSetup"}
            engaged={designProfileConfigured}
            disabled={isSending}
            onClick={() => onToggle("designSetup")}
            aria-label={WIRELINE_STITCH_UI.designSystemSetupTitle}
          />
        )}
        {showStitchBrandingToggle && (
          <ShadButton
            type="button"
            variant="ghost"
            size="sm"
            disableAnimations
            disabled={isSending}
            onClick={onToggleStitchAccountBranding}
            aria-pressed={useStitchAccountBranding}
            title={
              useStitchAccountBranding
                ? WIRELINE_STITCH_UI.brandingToggleHint
                : WIRELINE_STITCH_UI.brandingToggleEmptyHint
            }
            className={cn(
              WL_DIRECTOR_CLASSES.composerToolChip,
              "focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] hover:bg-brand/5 hover:border-brand/20",
              useStitchAccountBranding &&
                cn(
                  WL_DIRECTOR_CLASSES.composerToolChipActive,
                  "shadow-sm ring-1 ring-brand/30 bg-brand/10 hover:bg-brand/15",
                ),
              "h-auto touch-press rounded-full shadow-none",
            )}
          >
            <Palette className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{WIRELINE_STITCH_UI.brandingToggleLabel}</span>
            <span className="sm:hidden">Brand</span>
          </ShadButton>
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
              "transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] hover:bg-brand/5 hover:border-brand/20",
              forceDeep &&
                cn(
                  WL_DIRECTOR_CLASSES.composerToolChipActive,
                  "shadow-sm ring-1 ring-brand/30 bg-brand/10 hover:bg-brand/15",
                ),
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
