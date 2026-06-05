/**
 * Inline composer accessory panel — expands inside the dock so chat stays readable.
 * Replaces upward popovers that clipped or covered the message thread.
 */
import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Bot,
  Calendar,
  Brain,
  GraduationCap,
  FileSignature,
  FileText,
  Grid3X3,
  Loader2,
  Megaphone,
  MessageCircle,
  Paperclip,
  Phone,
  Plug,
  Search,
  ShoppingBag,
  Sparkles,
  Table,
  Users,
  Video,
  Wrench,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { DirectorCapabilityCatalog } from "./DirectorCapabilityCatalog";
import { AGENT_TOOL_CATALOG } from "../../lib/agent-capabilities";
import type { WorkspaceAgentSummary } from "../../contexts/AgentsContext";
import {
  WL_DIRECTOR_CLASSES,
  DIRECTOR_COMPOSER_ACCESSORY_HINTS,
  DIRECTOR_COMPOSER_CONTEXT,
  DIRECTOR_CAPABILITY_CATALOG,
  type ComposerAccessoryKind,
} from "../../lib/wireline-director-design";

export type { ComposerAccessoryKind };

export const CONNECTOR_CATALOG = [
  { icon: Phone, id: "twilio", label: "Twilio", desc: "Voice & SMS" },
  { icon: Calendar, id: "calendar", label: "Calendar", desc: "Google / Outlook" },
  { icon: Users, id: "crm", label: "CRM", desc: "Salesforce / HubSpot" },
  { icon: MessageCircle, id: "slack", label: "Slack", desc: "Team notifications" },
  { icon: Video, id: "zoom", label: "Zoom", desc: "Meeting links" },
  { icon: FileSignature, id: "docusign", label: "DocuSign", desc: "Contracts" },
  { icon: Search, id: "apollo", label: "Apollo", desc: "Lead enrichment" },
  { icon: ShoppingBag, id: "shopify", label: "Shopify", desc: "E-commerce" },
  { icon: Grid3X3, id: "square", label: "Square", desc: "Payments & POS" },
  { icon: MessageCircle, id: "microsoft_teams", label: "MS Teams", desc: "Team notifications" },
  { icon: Table, id: "microsoft_excel", label: "Excel", desc: "Call logging" },
  { icon: Table, id: "google_sheets", label: "Google Sheets", desc: "Call logging" },
  { icon: Megaphone, id: "meta", label: "Meta CAPI", desc: "Lead attribution" },
] as const;

const PANEL_META: Record<ComposerAccessoryKind, { label: string; icon: React.ElementType }> = {
  connectors: { label: "Connectors", icon: Plug },
  capabilities: { label: "Capabilities", icon: Sparkles },
  coach: { label: "Coach", icon: Bot },
  tools: { label: "Abilities", icon: Wrench },
  attach: { label: "Attach", icon: Paperclip },
};

export interface DirectorComposerAccessoryProps {
  active: ComposerAccessoryKind | null;
  onClose: () => void;
  agents: WorkspaceAgentSummary[];
  focusAgentId: string | null;
  focusedAgentName?: string;
  enabledTools: string[];
  isUploading: boolean;
  reduceMotion?: boolean;
  onPickCapability: (text: string) => void;
  onSelectCoach: (agentId: string | null) => void;
  onPickDocument: () => void;
  onPickContextRule: () => void;
  onPickPlaybookInstruction: () => void;
}

export function DirectorComposerAccessory({
  active,
  onClose,
  agents,
  focusAgentId,
  focusedAgentName,
  enabledTools,
  isUploading,
  reduceMotion = false,
  onPickCapability,
  onSelectCoach,
  onPickDocument,
  onPickContextRule,
  onPickPlaybookInstruction,
}: DirectorComposerAccessoryProps) {
  const meta = active ? PANEL_META[active] : null;
  const HeaderIcon = meta?.icon ?? Plug;
  const panelHint =
    active === "capabilities"
      ? `${DIRECTOR_COMPOSER_ACCESSORY_HINTS.capabilities} · ${DIRECTOR_CAPABILITY_CATALOG.length} skills`
      : active
        ? DIRECTOR_COMPOSER_ACCESSORY_HINTS[active]
        : "";

  return (
    <AnimatePresence mode="wait" initial={false}>
      {active && meta && (
        <motion.div
          key={active}
          id={`director-composer-accessory-${active}`}
          role="region"
          aria-label={meta.label}
          data-motion-panel
          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
          animate={reduceMotion ? undefined : { height: "auto", opacity: 1 }}
          exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              WL_DIRECTOR_CLASSES.composerAccessory,
              active === "capabilities" && "wl-composer-accessory-panel--embedded-catalog",
              "px-3 py-2 sm:px-4",
            )}
            data-motion-panel
          >
            <div className="flex items-start justify-between gap-3 mb-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex w-7 h-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <HeaderIcon className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="wl-label text-foreground">{meta.label}</p>
                  <p
                    className={cn(
                      WL_DIRECTOR_CLASSES.metaCaption,
                      "text-muted-foreground line-clamp-2",
                    )}
                  >
                    {panelHint}
                  </p>
                </div>
              </div>
              <ShadButton
                type="button"
                variant="ghost"
                size="sm"
                disableAnimations
                onClick={onClose}
                aria-label={DIRECTOR_COMPOSER_CONTEXT.closePanelLabel}
                className="h-8 min-w-[44px] px-2 wl-ops-chip text-muted shrink-0 touch-press"
              >
                Close
              </ShadButton>
            </div>

            {active === "connectors" && (
              <>
                <div className="wl-composer-accessory-connectors">
                  {CONNECTOR_CATALOG.map((c) => (
                    <Link
                      key={c.id}
                      to="/integrations"
                      onClick={onClose}
                      aria-label={`${c.label} — ${c.desc}`}
                      className="wl-composer-accessory-connector touch-press"
                    >
                      <span className="w-6 h-6 rounded-md bg-brand/12 flex items-center justify-center shrink-0">
                        <c.icon className="w-3 h-3 text-brand" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-foreground truncate">
                          {c.label}
                        </p>
                        <p className="text-[9px] text-muted-foreground truncate">{c.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
                <Link
                  to="/integrations"
                  onClick={onClose}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-brand hover:text-brand/80"
                >
                  <ArrowUpRight className="w-3 h-3" />
                  Manage integrations
                </Link>
              </>
            )}

            {active === "capabilities" && (
              <DirectorCapabilityCatalog
                variant="popover"
                embedded
                onPickExample={onPickCapability}
              />
            )}

            {active === "coach" && (
              <div className="space-y-0.5">
                <ShadButton
                  type="button"
                  variant="ghost"
                  disableAnimations
                  onClick={() => onSelectCoach(null)}
                  aria-pressed={!focusAgentId}
                  className={cn(
                    "w-full justify-start gap-2 px-2.5 py-2.5 h-auto text-[11px] rounded-md touch-press",
                    !focusAgentId && "bg-brand/8 text-brand font-medium border border-brand/15",
                  )}
                >
                  Fleet only
                </ShadButton>
                {agents.map((a) => (
                  <ShadButton
                    key={a.id}
                    type="button"
                    variant="ghost"
                    disableAnimations
                    onClick={() => onSelectCoach(a.id)}
                    aria-pressed={focusAgentId === a.id}
                    className={cn(
                      "w-full justify-start gap-2 px-2.5 py-2.5 h-auto rounded-md touch-press",
                      focusAgentId === a.id && "bg-brand/8 border border-brand/15",
                    )}
                  >
                    <span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-[10px] font-bold flex items-center justify-center shrink-0">
                      {a.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block text-[11px] font-semibold truncate">{a.name}</span>
                      <span className="block text-[9px] text-muted-foreground truncate">
                        {a.role?.replace(/_/g, " ") || "Agent"}
                      </span>
                    </span>
                  </ShadButton>
                ))}
                {agents.length === 0 && (
                  <p
                    className={cn(
                      WL_DIRECTOR_CLASSES.metaCaption,
                      "px-2 py-2 text-muted-foreground",
                    )}
                  >
                    Deploy an agent first
                  </p>
                )}
              </div>
            )}

            {active === "tools" && (
              <div>
                <p className="wl-label text-muted-foreground px-1 pb-1">
                  {enabledTools.length > 0
                    ? `${enabledTools.length} active for ${focusedAgentName || "agent"}`
                    : "No abilities enabled"}
                </p>
                {enabledTools.length === 0 ? (
                  <p className="px-1 py-1 text-[11px] text-muted-foreground">
                    Ask the Director to turn on capabilities.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {enabledTools.map((tool) => {
                      const toolMeta = AGENT_TOOL_CATALOG.find((t) => t.name === tool);
                      return (
                        <span
                          key={tool}
                          className="inline-flex px-2 py-1 rounded-md bg-brand/8 border border-brand/15 text-[10px] text-foreground"
                        >
                          {toolMeta?.label || tool}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {active === "attach" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                <ShadButton
                  type="button"
                  variant="ghost"
                  disableAnimations
                  disabled={isUploading}
                  onClick={onPickDocument}
                  className="h-auto justify-start gap-2 px-2.5 py-2.5 rounded-md touch-press"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 text-brand animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 text-brand" />
                  )}
                  <span className="text-left">
                    <span className="block text-[11px] font-semibold text-foreground">
                      Document
                    </span>
                    <span className="block text-[9px] text-muted-foreground">PDFs & files</span>
                  </span>
                </ShadButton>
                <ShadButton
                  type="button"
                  variant="ghost"
                  disableAnimations
                  onClick={onPickContextRule}
                  className="h-auto justify-start gap-2 px-2.5 py-2.5 rounded-md touch-press"
                >
                  <Brain className="w-4 h-4 text-brand" />
                  <span className="text-left">
                    <span className="block text-[11px] font-semibold text-foreground">Context</span>
                    <span className="block text-[9px] text-muted-foreground">Global rule</span>
                  </span>
                </ShadButton>
                <ShadButton
                  type="button"
                  variant="ghost"
                  disableAnimations
                  onClick={onPickPlaybookInstruction}
                  className="h-auto justify-start gap-2 px-2.5 py-2.5 rounded-md touch-press"
                >
                  <GraduationCap className="w-4 h-4 text-brand" />
                  <span className="text-left">
                    <span className="block text-[11px] font-semibold text-foreground">
                      Instruction
                    </span>
                    <span className="block text-[9px] text-muted-foreground">Playbook</span>
                  </span>
                </ShadButton>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
