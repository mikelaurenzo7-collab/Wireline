/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CreateAgentSection — Form for deploying new agents.
 * Extracted from the monolithic FleetSettings.tsx during the 2026 audit.
 */
import { useState } from "react";
import { Plus, Loader2, Sparkles, ChevronRight, Briefcase } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { AGENT_ROLES, type RoleValue } from "../fleet/helpers";
import { ClaudeRecipeButton } from "../ClaudeRecipes";

interface Props {
  isCreating: boolean;
  agents: any[];
  subscription: { status: string; max_agents: number };
  onCreate: (data: { id: string; name: string; channel: string; role: RoleValue }) => void;
  onSeedFleet: () => void;
}

export default function CreateAgentSection({
  isCreating,
  agents: _agents,
  subscription: _subscription,
  onCreate,
  onSeedFleet,
}: Props) {
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentChannel, setNewAgentChannel] = useState("voice");
  const [newAgentRole, setNewAgentRole] = useState<RoleValue>("customer_service");

  const handleCreate = () => {
    if (!newAgentId || !newAgentName) return;
    onCreate({ id: newAgentId, name: newAgentName, channel: newAgentChannel, role: newAgentRole });
    setNewAgentName("");
    setNewAgentId("");
  };

  return (
    <motion.div layout className="pt-4 mt-4 border-t border-white/8 border-dashed space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.3em] text-ink">Create a new agent</h3>
        <div className="flex items-center gap-1.5">
          <ClaudeRecipeButton recipe="agent-forge" label="Forge" variant="ghost" />
          <button
            onClick={onSeedFleet}
            className="px-2.5 py-1 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink hover:border-white/30 transition-all flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3" /> Seed
          </button>
        </div>
      </div>

      <div className="flex p-1 rounded-full glass border border-white/10">
        <button
          aria-pressed={newAgentChannel === "voice"}
          onClick={() => setNewAgentChannel("voice")}
          className={cn(
            "flex-1 py-1 rounded-full text-[10px] uppercase tracking-[0.25em] transition-colors",
            newAgentChannel === "voice" ? "bg-brand/15 text-brand" : "text-muted hover:text-ink",
          )}
        >
          Voice
        </button>
        <button
          aria-pressed={newAgentChannel === "email"}
          onClick={() => setNewAgentChannel("email")}
          className={cn(
            "flex-1 py-1 rounded-full text-[10px] uppercase tracking-[0.25em] transition-colors",
            newAgentChannel === "email" ? "bg-brand/15 text-brand" : "text-muted hover:text-ink",
          )}
        >
          Email
        </button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
            <Briefcase className="w-2.5 h-2.5 text-brand" /> Business role
          </label>
          <div className="relative">
            <select
              aria-label="Business role"
              value={newAgentRole}
              onChange={(e) => setNewAgentRole(e.target.value as RoleValue)}
              className="w-full text-xs bg-black/5 border border-black/10 rounded-lg pl-3 pr-7 py-2 outline-none focus:border-brand/50 cursor-pointer appearance-none text-ink"
            >
              {AGENT_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
          </div>
          <p className="text-[10px] text-muted/70 leading-relaxed">
            {AGENT_ROLES.find((r) => r.value === newAgentRole)?.description}
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
            Agent ID{" "}
            <span className="text-muted/70 normal-case tracking-normal">
              (lowercase, no spaces)
            </span>
          </label>
          <input
            type="text"
            placeholder="e.g. sales-bot-1"
            value={newAgentId}
            onChange={(e) => setNewAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/70 font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
            Agent name{" "}
            <span className="text-muted/70 normal-case tracking-normal">
              (what callers will hear)
            </span>
          </label>
          <input
            type="text"
            placeholder="e.g. Sophie"
            value={newAgentName}
            onChange={(e) => setNewAgentName(e.target.value)}
            className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/70"
          />
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={isCreating || !newAgentId || !newAgentName}
        className="brutal-btn w-full !py-2.5 !text-[11px] !tracking-[0.3em] disabled:opacity-50"
      >
        {isCreating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Plus className="w-3.5 h-3.5" />
        )}
        Create agent
      </button>
    </motion.div>
  );
}
