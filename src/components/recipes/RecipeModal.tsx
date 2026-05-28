/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
/**
 * Recipe modal shell — picks up `recipe`, mounts the matching form,
 * polls Anthropic availability, and provides the close affordance.
 *
 * Was inlined inside ClaudeRecipes.tsx; lifted into its own module
 * so the per-form code can live next to the form file it relates to.
 */

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Brain, X } from "lucide-react";
import { authFetch } from "../../lib/api";
import WidgetBoundary from "../WidgetBoundary";
import { NoKeyInline } from "./shared";
import { RECIPE_META, type AgentLite, type Recipe } from "./types";
import { CoachForm } from "./forms/CoachForm";
import { KnowledgeFromUrlForm } from "./forms/KnowledgeFromUrlForm";
import { AgentForgeForm } from "./forms/AgentForgeForm";
import { BriefForm } from "./forms/BriefForm";
import { EnrichLeadForm } from "./forms/EnrichLeadForm";
import { QualifyForm } from "./forms/QualifyForm";
import { ObjectionDrillForm } from "./forms/ObjectionDrillForm";
import { ColdEmailForm } from "./forms/ColdEmailForm";
import { PersonaCloneForm } from "./forms/PersonaCloneForm";
import { ThreadSummaryForm } from "./forms/ThreadSummaryForm";
import { AgentReviewForm } from "./forms/AgentReviewForm";
import { KnowledgeFromDocumentForm } from "./forms/KnowledgeFromDocumentForm";
import { CallPlaybookForm } from "./forms/CallPlaybookForm";

export function RecipeModal({
  recipe,
  agentId,
  threadId,
  callId,
  initial,
  onClose,
}: {
  recipe: Recipe;
  agentId?: string;
  threadId?: string;
  callId?: string;
  initial?: Record<string, any>;
  onClose: () => void;
}) {
  const meta = RECIPE_META[recipe];
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      try {
        const [statusRes, agentsRes] = await Promise.all([
          authFetch("/api/claude/status"),
          authFetch("/api/agents"),
        ]);
        // Only flip `available = false` on an actual 200 that explicitly
        // reports `available: false`. A 401 means the user's token hasn't
        // landed yet (or expired) — that's NOT an AI outage and we
        // shouldn't scare the user with a red "Wireline AI unavailable"
        // banner. Stay in the loading null-state and let the next render
        // retry once auth catches up.
        if (statusRes.ok) {
          const s = await statusRes.json();
          setAvailable(!!s.available);
        } else if (statusRes.status === 401) {
          setAvailable(null);
        } else {
          setAvailable(false);
        }
        const a = await agentsRes.json();
        setAgents(
          (a.agents ?? []).map((x: any) => ({ id: x.id, name: x.name, archetype: x.archetype })),
        );
      } catch {
        setAvailable(null);
      }
    })();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-8"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 24 }}
        transition={{ type: "spring", damping: 26, stiffness: 220 }}
        className="relative aurora-ring rounded-3xl w-full max-w-3xl max-h-[88vh] flex flex-col"
      >
        <div className="relative rounded-3xl glass-strong overflow-hidden flex flex-col flex-1 min-h-0">
          <div
            className="absolute -top-32 -right-32 w-64 h-64 rounded-full max-w-[50vw] max-h-[50vw] sm:max-w-none sm:max-h-none opacity-25 blur-3xl pointer-events-none"
            style={{ background: `radial-gradient(circle, ${meta.accent}, transparent)` }}
          />

          <div className="relative z-10 flex items-center justify-between px-7 py-5 border-b border-white/8">
            <div className="flex items-center gap-4">
              <div
                className="w-11 h-11 rounded-2xl glass border border-white/10 flex items-center justify-center"
                style={{ color: meta.accent }}
              >
                <meta.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display italic text-2xl leading-none">{meta.title}</h2>
                  {meta.thinking && (
                    <span className="px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 text-[9px] uppercase tracking-[0.25em] text-brand flex items-center gap-1">
                      <Brain className="w-2.5 h-2.5" /> Adaptive
                    </span>
                  )}
                </div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted mt-1">
                  {meta.tagline}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center text-ink/70 hover:text-ink hover:border-brand/40 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {available === false && <NoKeyInline />}
          <WidgetBoundary label={meta.title}>
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {recipe === "brief" && (
                <BriefForm
                  agents={agents}
                  agentId={agentId}
                  initial={initial}
                  disabled={!available}
                />
              )}
              {recipe === "enrich-lead" && (
                <EnrichLeadForm initial={initial} disabled={!available} />
              )}
              {recipe === "qualify" && (
                <QualifyForm callId={callId} initial={initial} disabled={!available} />
              )}
              {recipe === "objection-drill" && (
                <ObjectionDrillForm
                  agents={agents}
                  agentId={agentId}
                  initial={initial}
                  disabled={!available}
                />
              )}
              {recipe === "cold-email" && (
                <ColdEmailForm
                  agents={agents}
                  agentId={agentId}
                  initial={initial}
                  disabled={!available}
                />
              )}
              {recipe === "persona-clone" && (
                <PersonaCloneForm agents={agents} agentId={agentId} disabled={!available} />
              )}
              {recipe === "summarize-thread" && (
                <ThreadSummaryForm threadId={threadId} disabled={!available} />
              )}
              {recipe === "agent-review" && (
                <AgentReviewForm agents={agents} agentId={agentId} disabled={!available} />
              )}
              {recipe === "coach" && (
                <CoachForm callId={callId} initial={initial} disabled={!available} />
              )}
              {recipe === "knowledge-from-url" && (
                <KnowledgeFromUrlForm
                  agents={agents}
                  agentId={agentId}
                  initial={initial}
                  disabled={!available}
                />
              )}
              {recipe === "knowledge-from-document" && (
                <KnowledgeFromDocumentForm
                  agents={agents}
                  agentId={agentId}
                  disabled={!available}
                />
              )}
              {recipe === "agent-forge" && (
                <AgentForgeForm initial={initial} disabled={!available} />
              )}
              {recipe === "call-playbook" && (
                <CallPlaybookForm
                  agents={agents}
                  agentId={agentId}
                  initial={initial}
                  disabled={!available}
                />
              )}
            </div>
          </WidgetBoundary>
        </div>
      </motion.div>
    </motion.div>
  );
}
