import { useCallback, useEffect, useState } from "react";
import { Loader2, Megaphone, Pause, Play, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { authFetch } from "../../lib/api";
import { logFetchError } from "../../lib/utils";
import { useToast } from "../../contexts/ToastContext";
import { EmptyState } from "../ui/EmptyState";
import ClientRouteLoading from "../layout/ClientRouteLoading";
import { OPS_CHANNEL_EMPTY, OPS_CHANNEL_TOOLBAR } from "../../lib/wireline-ops-design";
import { Input } from "../ui/shadcn/Input";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/Select";
import { cn } from "../../lib/utils";
import {
  SALES_PLAYBOOKS,
  playbookGoalTag,
  parsePlaybookFromGoal,
  type SalesPlaybookId,
} from "../../lib/sales-playbooks";

type Campaign = {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  agent_id: string | null;
  leads_count: number;
  dialed_count: number;
  connected_count: number;
  call_window_start?: string;
  call_window_end?: string;
  max_attempts?: number;
};

type Agent = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
  stopped: "Stopped",
};

export default function CampaignsPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [playbookId, setPlaybookId] = useState<SalesPlaybookId>("speed-to-lead");
  const [agentId, setAgentId] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [campRes, agentRes] = await Promise.all([
        authFetch("/api/campaigns"),
        authFetch("/api/agents"),
      ]);
      if (!campRes.ok) throw new Error("Failed to load campaigns");
      const campBody = await campRes.json();
      setCampaigns(Array.isArray(campBody.campaigns) ? campBody.campaigns : []);
      if (agentRes.ok) {
        const agentBody = await agentRes.json();
        const list = Array.isArray(agentBody.agents) ? agentBody.agents : [];
        setAgents(list.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })));
      }
    } catch (e) {
      logFetchError("CampaignsPanel.load", e);
      setError("Couldn't load campaigns. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCampaign() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await authFetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          goal: playbookGoalTag(playbookId),
          agent_id: agentId || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create campaign");
      }
      toast.success("Campaign created");
      setShowCreate(false);
      setName("");
      setGoal("");
      setPlaybookId("speed-to-lead");
      setAgentId("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setCreating(false);
    }
  }

  async function launchCampaign(id: string, campaignGoal?: string | null) {
    const playbook = parsePlaybookFromGoal(campaignGoal);
    const checklist = [
      "I attest lead source and consent provenance are documented for this list.",
      "Workspace call windows and retry caps are enforced at dial time (server timezone; not lead-state jurisdiction hours).",
      "I understand DNC / TCPA / federal DNC gates run on every dial attempt.",
    ];
    const confirmed = window.confirm(
      `Launch attestation (dialer still enforces DNC/TCPA and workspace call windows):\n\n${checklist
        .map((line) => `• ${line}`)
        .join("\n")}\n\n${
        playbook ? `Playbook: ${playbook}` : "No playbook tag on this campaign."
      }\n\nProceed with launch?`,
    );
    if (!confirmed) return;
    setBusyId(id);
    try {
      const res = await authFetch(`/api/campaigns/${id}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ launch_approval_confirmed: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Launch failed");
      }
      toast.success("Campaign launched");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't launch campaign");
    } finally {
      setBusyId(null);
    }
  }

  async function stopCampaign(id: string) {
    setBusyId(id);
    try {
      const res = await authFetch(`/api/campaigns/${id}/stop`, { method: "POST" });
      if (!res.ok) throw new Error("Stop failed");
      toast.success("Campaign stopped");
      await load();
    } catch {
      toast.error("Couldn't stop campaign");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteCampaign(id: string) {
    if (!confirm("Delete this campaign and its lead list?")) return;
    setBusyId(id);
    try {
      const res = await authFetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Campaign deleted");
      await load();
    } catch {
      toast.error("Couldn't delete campaign");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <ClientRouteLoading icon={<Megaphone className="h-5 w-5" />} label="Loading campaigns" />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          OPS_CHANNEL_TOOLBAR,
          "flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <p className="hidden text-sm text-muted-foreground sm:block">
          TCPA-guarded batch dialing within call windows.
        </p>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <ShadButton
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            aria-label="Refresh campaigns"
            title="Refresh campaigns"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </ShadButton>
          {campaigns.length > 0 ? (
            <ShadButton
              type="button"
              size="sm"
              className="justify-center"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Create campaign
            </ShadButton>
          ) : null}
        </div>
      </div>

      {error && (
        <div
          className="mx-4 mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      {showCreate && (
        <div className="mx-4 mt-4 rounded-md border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Create campaign</h3>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              aria-label="Close campaign form"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <Input
            aria-label="Campaign name"
            placeholder="Campaign name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            value={playbookId}
            onValueChange={(value) => setPlaybookId(value as SalesPlaybookId)}
          >
            <SelectTrigger aria-label="Sales playbook">
              <SelectValue placeholder="Sales playbook" />
            </SelectTrigger>
            <SelectContent>
              {SALES_PLAYBOOKS.map((playbook) => (
                <SelectItem key={playbook.id} value={playbook.id}>
                  {playbook.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {SALES_PLAYBOOKS.find((playbook) => playbook.id === playbookId)?.objective}
          </p>
          <Input
            aria-label="Campaign notes"
            placeholder="Notes (optional)"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <Select
            value={agentId || "__none__"}
            onValueChange={(v) => setAgentId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger aria-label="Assign voice agent">
              <SelectValue placeholder="Assign voice agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No voice agent assigned</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ShadButton
            type="button"
            disabled={creating || !name.trim()}
            onClick={() => void createCampaign()}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create draft"}
          </ShadButton>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {campaigns.length === 0 && !error ? (
          <div className="flex w-full flex-col items-center px-2 py-6 sm:px-4">
            <EmptyState
              framed
              density="compact"
              titleTone="ui"
              withHalo={false}
              className="w-full max-w-lg"
              icon={Megaphone}
              title={OPS_CHANNEL_EMPTY.campaigns.title}
              actions={[
                { label: "Create campaign", onClick: () => setShowCreate(true), primary: true },
                ...OPS_CHANNEL_EMPTY.campaigns.actions.filter((a) => a.label !== "Create campaign"),
              ]}
            />
          </div>
        ) : (
          <ul className="space-y-3">
            {campaigns.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="wl-preserve-case font-medium truncate">{c.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                      {STATUS_LABEL[c.status] || c.status}
                    </span>
                  </div>
                  {c.goal && (
                    <p className="text-sm text-muted-foreground mt-1 truncate">{c.goal}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {c.leads_count} leads · {c.dialed_count} dialed · {c.connected_count} connected
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.status === "draft" || c.status === "paused" ? (
                    <ShadButton
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busyId === c.id}
                      onClick={() => void launchCampaign(c.id, c.goal)}
                    >
                      {busyId === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      Launch
                    </ShadButton>
                  ) : c.status === "running" ? (
                    <ShadButton
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === c.id}
                      onClick={() => void stopCampaign(c.id)}
                    >
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </ShadButton>
                  ) : null}
                  <ShadButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busyId === c.id}
                    onClick={() => void deleteCampaign(c.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </ShadButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
