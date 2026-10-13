import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Check, Loader2, Search, Settings2, Trash2 } from "lucide-react";
import { authFetch } from "../../lib/api";
import { logFetchError } from "../../lib/utils";
import { useToast } from "../../contexts/ToastContext";
import { Checkbox } from "../ui/shadcn/Checkbox";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/Select";

type LeadHuntCampaign = {
  id: string;
  name: string;
  status: string;
  agent_id: string | null;
};

type LeadHuntAgent = { id: string; name: string };

type LeadHuntLead = {
  id: string;
  customer_name: string | null;
  customer_number: string;
  title: string | null;
  company: string | null;
  phone_source: "person" | "organization" | null;
  city: string | null;
  state: string | null;
};

function responseError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return fallback;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForLeadHuntJob(
  jobId: string,
  initial: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let snapshot = initial;
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const status = typeof snapshot.status === "string" ? snapshot.status : "";
    if (status === "done") {
      return snapshot.result && typeof snapshot.result === "object"
        ? (snapshot.result as Record<string, unknown>)
        : {};
    }
    if (status === "failed" || status === "dead") {
      throw new Error(responseError(snapshot, "Lead Hunt could not complete."));
    }

    await wait(1_500);
    const pollResponse = await authFetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    const pollBody = await pollResponse.json().catch(() => ({}));
    if (!pollResponse.ok) {
      throw new Error(responseError(pollBody, "Could not check Lead Hunt status."));
    }
    const job =
      pollBody.job && typeof pollBody.job === "object"
        ? (pollBody.job as Record<string, unknown>)
        : {};
    snapshot = job;
  }

  throw new Error("Lead Hunt is still running. Check the review queue again in a moment.");
}

export function LeadHuntReview({
  campaigns,
  agents,
  onAssigned,
}: {
  campaigns: LeadHuntCampaign[];
  agents: LeadHuntAgent[];
  onAssigned: () => Promise<void>;
}) {
  const toast = useToast();
  const [leads, setLeads] = useState<LeadHuntLead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [campaignId, setCampaignId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [reviewApproved, setReviewApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hunting, setHunting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leadListOperationRef = useRef(0);
  const leadListAbortRef = useRef<AbortController | null>(null);

  const draftCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.status === "draft"),
    [campaigns],
  );
  const selectedCampaign = useMemo(
    () => draftCampaigns.find((campaign) => campaign.id === campaignId),
    [campaignId, draftCampaigns],
  );

  const loadLeads = useCallback(async () => {
    leadListAbortRef.current?.abort();
    const controller = new AbortController();
    leadListAbortRef.current = controller;
    const operation = ++leadListOperationRef.current;
    const isCurrentRequest = () =>
      !controller.signal.aborted && leadListOperationRef.current === operation;
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/lead-hunt/leads", { signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseError(body, "Could not load Lead Hunt results."));
      if (!isCurrentRequest()) return;
      const nextLeads = Array.isArray(body.leads) ? (body.leads as LeadHuntLead[]) : [];
      setLeads(nextLeads);
      setSelectedIds((current) => {
        const available = new Set(nextLeads.map((lead) => lead.id));
        return new Set([...current].filter((id) => available.has(id)));
      });
    } catch (reason) {
      if (!isCurrentRequest()) return;
      logFetchError("LeadHuntReview.load", reason);
      setError(reason instanceof Error ? reason.message : "Could not load Lead Hunt results.");
    } finally {
      if (isCurrentRequest()) setLoading(false);
      if (leadListAbortRef.current === controller) leadListAbortRef.current = null;
    }
  }, []);

  useEffect(() => {
    void loadLeads();
    return () => leadListAbortRef.current?.abort();
  }, [loadLeads]);

  useEffect(() => {
    if (!campaignId && draftCampaigns[0]) {
      setCampaignId(draftCampaigns[0].id);
      setAgentId(draftCampaigns[0].agent_id || agents[0]?.id || "");
      return;
    }
    const campaign = draftCampaigns.find((candidate) => candidate.id === campaignId);
    if (!campaign && campaignId) {
      setCampaignId("");
      setAgentId(agents[0]?.id || "");
      return;
    }
    if (campaign?.agent_id && agentId !== campaign.agent_id) {
      setAgentId(campaign.agent_id);
    }
  }, [agentId, agents, campaignId, draftCampaigns]);

  useEffect(() => {
    setReviewApproved(false);
  }, [agentId, campaignId, selectedIds]);

  async function findLeads() {
    setHunting(true);
    setError(null);
    try {
      const queuedResponse = await authFetch("/api/jobs/prospect", { method: "POST" });
      const queuedBody = await queuedResponse.json().catch(() => ({}));
      if (!queuedResponse.ok) {
        throw new Error(responseError(queuedBody, "Lead Hunt could not start."));
      }
      const jobId = typeof queuedBody.jobId === "string" ? queuedBody.jobId : "";
      if (!jobId) throw new Error("Lead Hunt did not return a job ID.");

      const runResponse = await authFetch(`/api/jobs/${jobId}/run`, { method: "POST" });
      const runBody = await runResponse.json().catch(() => ({}));
      if (!runResponse.ok) {
        throw new Error(responseError(runBody, "Lead Hunt could not complete."));
      }
      const result = await waitForLeadHuntJob(jobId, runBody as Record<string, unknown>);
      if (result.skipped === true) {
        throw new Error(
          typeof result.hint === "string" ? result.hint : "Lead Hunt is not ready to run.",
        );
      }

      await loadLeads();
      const added = Number(result.leadsAdded || 0);
      const found = Number(result.leadsFound || 0);
      if (added > 0)
        toast.success(`${added} phone-ready lead${added === 1 ? "" : "s"} ready for review`);
      else if (found > 0) toast.success("No new leads; Apollo matches were already in review");
      else toast.success("No phone-ready leads matched this search");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Lead Hunt could not complete.";
      setError(message);
      toast.error(message);
    } finally {
      setHunting(false);
    }
  }

  async function approveSelected() {
    if (!campaignId || !agentId || selectedIds.size === 0 || !reviewApproved) return;
    setAssigning(true);
    setError(null);
    try {
      const response = await authFetch("/api/lead-hunt/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_ids: [...selectedIds],
          campaign_id: campaignId,
          agent_id: agentId,
          review_approved: true,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseError(body, "Could not add reviewed leads to the campaign."));
      }

      const assigned = Number(body.assigned || selectedIds.size);
      setSelectedIds(new Set());
      setReviewApproved(false);
      await Promise.all([loadLeads(), onAssigned()]);
      toast.success(`${assigned} reviewed lead${assigned === 1 ? "" : "s"} added to the draft`);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Could not add reviewed leads to the campaign.";
      setError(message);
      toast.error(message);
    } finally {
      setAssigning(false);
    }
  }

  async function rejectLead(id: string) {
    try {
      const response = await authFetch(`/api/lead-hunt/leads/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseError(body, "Could not remove this lead."));
      }
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setLeads((current) => current.filter((lead) => lead.id !== id));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not remove this lead.");
    }
  }

  const allSelected = leads.length > 0 && selectedIds.size === leads.length;

  return (
    <section className="mx-4 mt-4 rounded-xl border border-brand/25 bg-brand/5 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-brand" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">Find. Review. Queue.</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Find matches for your targeting. Review each lead before a campaign calls.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ShadButton type="button" variant="outline" size="sm" asChild>
            <Link to="/admin?tab=flywheel">
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              Targeting
            </Link>
          </ShadButton>
          <ShadButton type="button" size="sm" disabled={hunting} onClick={() => void findLeads()}>
            {hunting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Search className="h-3.5 w-3.5" aria-hidden />
            )}
            Find Leads
          </ShadButton>
        </div>
      </div>

      {error ? (
        <p
          className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading review queue…
        </div>
      ) : leads.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border bg-card/60 px-4 py-4 text-sm text-muted-foreground">
          No leads waiting for review.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Checkbox
                checked={allSelected}
                onChange={(event) =>
                  setSelectedIds(
                    event.target.checked ? new Set(leads.map((lead) => lead.id)) : new Set(),
                  )
                }
              />
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : `Select all ${leads.length}`}
            </label>
            <span className="text-[11px] text-muted-foreground">Phone-bearing matches only</span>
          </div>

          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {leads.map((lead) => {
              const location = [lead.city, lead.state].filter(Boolean).join(", ");
              return (
                <li
                  key={lead.id}
                  className="flex items-start gap-3 rounded-md border border-border bg-card p-3"
                >
                  <Checkbox
                    className="mt-1"
                    checked={selectedIds.has(lead.id)}
                    aria-label={`Select ${lead.customer_name || lead.customer_number}`}
                    onChange={(event) =>
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(lead.id);
                        else next.delete(lead.id);
                        return next;
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {lead.customer_name || "Unnamed lead"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[lead.title, lead.company].filter(Boolean).join(" · ") || "Apollo match"}
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {lead.customer_number}
                      {lead.phone_source === "organization" ? " · company line" : ""}
                      {location ? ` · ${location}` : ""}
                    </p>
                  </div>
                  <ShadButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${lead.customer_name || lead.customer_number}`}
                    onClick={() => void rejectLead(lead.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </ShadButton>
                </li>
              );
            })}
          </ul>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={campaignId || "__none__"}
              onValueChange={(value) => {
                const nextId = value === "__none__" ? "" : value;
                setCampaignId(nextId);
                const campaign = draftCampaigns.find((candidate) => candidate.id === nextId);
                if (campaign?.agent_id) setAgentId(campaign.agent_id);
              }}
            >
              <SelectTrigger aria-label="Draft campaign">
                <SelectValue placeholder="Choose draft campaign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Choose draft campaign</SelectItem>
                {draftCampaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={agentId || "__none__"}
              onValueChange={(value) => setAgentId(value === "__none__" ? "" : value)}
              disabled={!!selectedCampaign?.agent_id}
            >
              <SelectTrigger aria-label="Assign Bot">
                <SelectValue placeholder="Choose Bot" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Choose Bot</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {draftCampaigns.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Create a draft campaign below before approving leads.
            </p>
          ) : null}

          <label className="flex items-start gap-3 rounded-md border border-border bg-card p-3">
            <Checkbox
              className="mt-0.5"
              checked={reviewApproved}
              onChange={(event) => setReviewApproved(event.target.checked)}
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              I reviewed these recipients and approve adding them to this draft. This approval is
              not consent proof and does not bypass suppression, DNC, TCPA, calling-hour, or launch
              gates.
            </span>
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted-foreground">
              Approved leads enter the queue, but nothing calls until the separate Launch
              attestation.
            </p>
            <ShadButton
              type="button"
              size="sm"
              disabled={
                assigning || selectedIds.size === 0 || !campaignId || !agentId || !reviewApproved
              }
              onClick={() => void approveSelected()}
            >
              {assigning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden />
              )}
              Approve &amp; add to draft
            </ShadButton>
          </div>
        </div>
      )}
    </section>
  );
}
