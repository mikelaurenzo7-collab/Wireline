/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
/**
 * Recipe modal shell — picks up `recipe`, mounts the matching form,
 * polls the managed OpenAI reasoning runtime, and provides the close affordance.
 *
 * The recipe forms live beside the workflow they implement so this shell stays
 * focused on availability, agent selection, and modal lifecycle.
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
import { AgentWireForm } from "./forms/AgentWireForm";
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
import { ShadButton } from "../ui/shadcn/ShadButton";

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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [statusRes, agentsRes] = await Promise.all([
          authFetch("/api/health/public"),
          authFetch("/api/agents"),
        ]);
        if (cancelled) return;

        // The public health contract reports the actual managed reasoning lane.
        // Only an explicit non-operational result disables recipes. A transient
        // auth failure on the agent list must not be mislabeled as an AI outage.
        if (statusRes.ok) {
          const status = (await statusRes.json()) as {
            components?: { reasoning?: string };
          };
          setAvailable(status.components?.reasoning === "operational");
        } else if (statusRes.status === 429) {
          setAvailable(null);
        } else {
          setAvailable(false);
        }

        if (agentsRes.ok) {
          const body = (await agentsRes.json()) as { agents?: AgentLite[] };
          setAgents(
            (body.agents ?? []).map((agent) => ({
              id: agent.id,
              name: agent.name,
              archetype: agent.archetype,
            })),
          );
        }
      } catch {
        if (!cancelled) setAvailable(null);
      }
    })();

    return () => {
      cancelled = true;
    };
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
        className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-border wl-panel-elevated"
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md wl-panel-elevated">
          <div
            className="pointer-events-none absolute -right-32 -top-32 h-64 max-h-[50vw] w-64 max-w-[50vw] rounded-full opacity-25 blur-3xl wl-recipe-halo sm:max-h-none sm:max-w-none"
            data-recipe-accent={meta.accent}
          />

          <div className="relative z-10 flex items-center justify-between border-b border-white/8 px-7 py-5">
            <div className="flex items-center gap-4">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-md border border-white/10 wl-panel wl-recipe-icon"
                data-recipe-accent={meta.accent}
              >
                <meta.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-2xl italic leading-none">{meta.title}</h2>
                  {meta.thinking && (
                    <span className="flex items-center gap-1 rounded-full border border-brand/20 bg-brand/10 px-2 py-0.5 wl-label text-brand">
                      <Brain className="h-2.5 w-2.5" /> Adaptive
                    </span>
                  )}
                </div>
                <p className="mt-1 wl-label-muted">{meta.tagline}</p>
              </div>
            </div>
            <ShadButton
              variant="outline"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="h-10 w-10 rounded-full hover:border-brand/40"
            >
              <X className="h-4 w-4" />
            </ShadButton>
          </div>

          {available === false && <NoKeyInline />}
          <WidgetBoundary label={meta.title}>
            <div className="scrollbar-hide flex-1 scroll-viewport">
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
              {recipe === "agent-wire" && <AgentWireForm initial={initial} disabled={!available} />}
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
