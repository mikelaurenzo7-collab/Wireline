import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, Phone, Plus } from "lucide-react";
import { Link, useLocation } from "react-router";

import { Button, EmptyState } from "./atoms";
import { StatusNotice } from "./molecules";
import CompanyIdentityPack from "./settings/CompanyIdentityPack";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { useAgents } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";

type PhoneNumberRecord = {
  id: string;
  phone_number: string;
  agent_id?: string | null;
  campaign_label?: string | null;
  created_at?: string | null;
};

type ProvisionResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  recovery_path?: string;
  reused?: boolean;
};

const PHONE_AGENT_UNSET = "__unassigned__";

function formatPhone(value?: string | null) {
  if (!value) return "No number yet";
  const digits = value.replace(/\D/g, "");
  const domestic = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (domestic.length !== 10) return value;
  return `(${domestic.slice(0, 3)}) ${domestic.slice(3, 6)}-${domestic.slice(6)}`;
}

function formatProvisionedDate(value?: string | null) {
  if (!value) return "Active";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Active";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function PhoneSetupPanel() {
  const { agents, loading: agentsLoading, degraded: agentsDegraded } = useAgents();
  const location = useLocation();
  const [numbers, setNumbers] = useState<PhoneNumberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [areaCode, setAreaCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryPath, setRecoveryPath] = useState<string | null>(null);
  const [selectedNumberId, setSelectedNumberId] = useState<string | null>(null);
  const [addingLine, setAddingLine] = useState(false);

  const activeNumber =
    numbers.find((number) => number.id === selectedNumberId) || numbers[0] || null;
  const attachedAgent = useMemo(
    () => agents.find((agent) => agent.id === activeNumber?.agent_id),
    [activeNumber?.agent_id, agents],
  );

  useEffect(() => {
    if (location.hash !== "#company-identity") return;
    const id = window.setTimeout(() => {
      document
        .getElementById("company-identity")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.hash]);

  useEffect(() => {
    const currentAgentId = activeNumber?.agent_id || "";
    if (currentAgentId && agents.some((agent) => agent.id === currentAgentId)) {
      setSelectedAgentId(currentAgentId);
      return;
    }
    if (selectedAgentId && agents.some((agent) => agent.id === selectedAgentId)) return;
    setSelectedAgentId(agents[0]?.id || "");
  }, [activeNumber?.agent_id, agents, selectedAgentId]);

  async function loadNumbers() {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/phone-numbers");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Phone numbers unavailable.");
      const nextNumbers = Array.isArray(body?.numbers) ? body.numbers : [];
      setNumbers(nextNumbers);
      setSelectedNumberId((current) =>
        current && nextNumbers.some((number: PhoneNumberRecord) => number.id === current)
          ? current
          : (nextNumbers[0]?.id ?? null),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Phone numbers unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNumbers();
  }, []);

  async function provisionNumber() {
    if (working || !selectedAgentId) return;
    const requestedAreaCode = areaCode.replace(/\D/g, "").slice(0, 3);
    if (requestedAreaCode && requestedAreaCode.length !== 3) {
      setError("Enter a 3-digit area code, or leave it blank.");
      return;
    }
    setWorking(true);
    setMessage(null);
    setError(null);
    setRecoveryPath(null);
    try {
      const response = await authFetch("/api/phone-numbers/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: selectedAgentId,
          ...(requestedAreaCode ? { area_code: requestedAreaCode } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as ProvisionResponse;
      if (!response.ok || body.ok === false) {
        setRecoveryPath(
          body.recovery_path ||
            (body.code === "ACTIVATION_REQUIRED" || body.code === "SUBSCRIPTION_REQUIRED"
              ? "/settings/billing"
              : null),
        );
        throw new Error(body.error || "Could not activate a number.");
      }
      setMessage(body.reused ? "Existing line connected." : "Line activated.");
      await loadNumbers();
      setAddingLine(false);
      setAreaCode("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not activate a number.");
    } finally {
      setWorking(false);
    }
  }

  async function attachAgent(agentId: string | null) {
    if (!activeNumber || attaching) return;
    setAttaching(true);
    setMessage(null);
    setError(null);
    try {
      const response = await authFetch(`/api/phone-numbers/${activeNumber.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Could not update this line.");
      setNumbers((current) =>
        current.map((number) =>
          number.id === activeNumber.id ? { ...number, agent_id: agentId } : number,
        ),
      );
      setSelectedAgentId(agentId || "");
      setMessage(agentId ? "Bot assigned." : "Line unassigned.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this line.");
    } finally {
      setAttaching(false);
    }
  }

  const normalizedAreaCode = areaCode.replace(/\D/g, "").slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Lines</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{numbers.length} active</p>
        </div>
        {numbers.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setAddingLine((value) => !value)}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add line
          </Button>
        ) : null}
      </div>

      {error ? (
        <StatusNotice
          tone="destructive"
          title="Lines need attention"
          action={
            recoveryPath ? (
              <Button asChild size="sm" variant="secondary">
                <Link to={recoveryPath}>Open billing</Link>
              </Button>
            ) : undefined
          }
        >
          {error}
        </StatusNotice>
      ) : null}
      {message ? <StatusNotice tone="success">{message}</StatusNotice> : null}

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Loading lines…
        </div>
      ) : numbers.length === 0 && !addingLine ? (
        <EmptyState
          framed
          density="compact"
          titleTone="ui"
          withHalo={false}
          icon={<Phone className="size-5" aria-hidden="true" />}
          title="No line yet"
          description="Add a number when this Bot is ready for real calls."
          action={
            <Button type="button" onClick={() => setAddingLine(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add line
            </Button>
          }
        />
      ) : null}

      {addingLine ? (
        <section
          className="rounded-xl border border-border bg-card p-4 sm:p-5"
          aria-label="Add phone line"
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-foreground">Bot</span>
              {agentsLoading ? (
                <div className="flex h-10 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : agents.length ? (
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger className="h-10" aria-label="Bot for this line">
                    <SelectValue placeholder="Select Bot" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : agentsDegraded ? (
                <div className="flex h-10 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground">
                  Bots unavailable.
                </div>
              ) : (
                <Button asChild variant="secondary">
                  <Link to="/studio?create=1">Create Bot</Link>
                </Button>
              )}
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-foreground">Area code</span>
              <span className="relative block">
                <MapPin
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  value={normalizedAreaCode}
                  onChange={(event) =>
                    setAreaCode(event.target.value.replace(/\D/g, "").slice(0, 3))
                  }
                  placeholder="312"
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/50"
                />
              </span>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void provisionNumber()}
              disabled={working || agentsLoading || !selectedAgentId}
            >
              {working ? "Activating…" : "Activate"}
            </Button>
            {numbers.length ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setAddingLine(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {numbers.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {numbers.map((number) => {
              const selected = number.id === activeNumber?.id;
              const bot = agents.find((agent) => agent.id === number.agent_id);
              return (
                <button
                  key={number.id}
                  type="button"
                  onClick={() => setSelectedNumberId(number.id)}
                  className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-3 text-left last:border-b-0 ${selected ? "bg-primary/7" : "hover:bg-muted/45"}`}
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-semibold text-foreground">
                      {formatPhone(number.phone_number)}
                    </strong>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {bot?.name || "Unassigned"}
                    </span>
                  </span>
                  {selected ? (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {activeNumber ? (
            <section
              className="rounded-xl border border-border bg-card p-4 sm:p-5"
              aria-label="Selected line"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">
                    {formatPhone(activeNumber.phone_number)}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Active · {formatProvisionedDate(activeNumber.created_at)}
                  </p>
                </div>
                <Button asChild size="sm" variant="secondary">
                  <a href={`tel:${activeNumber.phone_number}`}>
                    <Phone className="size-4" aria-hidden="true" />
                    Call
                  </a>
                </Button>
              </div>

              <label className="mt-5 grid gap-1.5">
                <span className="text-xs font-semibold text-foreground">Assigned Bot</span>
                <Select
                  value={activeNumber.agent_id || PHONE_AGENT_UNSET}
                  onValueChange={(value) =>
                    void attachAgent(value === PHONE_AGENT_UNSET ? null : value)
                  }
                  disabled={attaching || agentsLoading}
                >
                  <SelectTrigger className="h-10" aria-label="Assigned Bot">
                    <SelectValue placeholder="Assign Bot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PHONE_AGENT_UNSET}>Unassigned</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              {attachedAgent ? (
                <Button asChild variant="link" size="sm" className="mt-2 px-0">
                  <Link to={`/studio?agent=${encodeURIComponent(attachedAgent.id)}`}>
                    Open {attachedAgent.name}
                  </Link>
                </Button>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      <details
        id="company-identity"
        className="rounded-xl border border-border bg-card"
        data-visual-qa-state={
          location.hash === "#company-identity" ? "company-identity" : undefined
        }
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
          Caller identity
        </summary>
        <div className="border-t border-border p-4">
          <CompanyIdentityPack />
        </div>
      </details>
    </div>
  );
}
