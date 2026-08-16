import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, Phone, Plus } from "lucide-react";
import { Link, useLocation } from "react-router";

import { Button } from "./atoms";
import { StatusNotice } from "./molecules";
import CompanyIdentityPack from "./settings/CompanyIdentityPack";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { useAgents } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";
import { WL_APP_CLASSES } from "../lib/wireline-design-system";

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
  if (!value) return "Ready when activated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Activated";
  return `Activated ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
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
      document.getElementById("company-identity")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.hash, location.pathname]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Phone numbers unavailable.");
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
    // The carrier route requires exactly three digits. Submitting a partial one
    // bounced back as a raw field-level validation error naming `area_code`.
    if (requestedAreaCode && requestedAreaCode.length !== 3) {
      setError("Enter a full 3-digit area code, or leave it blank for any local number.");
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
      setMessage(
        body.reused
          ? "Your existing number is connected and ready for calls."
          : "Your dedicated number is active and ready for calls.",
      );
      await loadNumbers();
      setAddingLine(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not activate a number.");
    } finally {
      setWorking(false);
    }
  }

  async function attachAgent(agentId: string | null) {
    if (!activeNumber || attaching) return;
    setAttaching(true);
    setMessage(null);
    setError(null);
    setRecoveryPath(null);
    try {
      const response = await authFetch(`/api/phone-numbers/${activeNumber.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Could not attach voice agent.");
      setNumbers((previous) =>
        previous.map((number) =>
          number.id === activeNumber.id ? { ...number, agent_id: agentId } : number,
        ),
      );
      setSelectedAgentId(agentId || "");
      setMessage(agentId ? "Voice agent attached to this line." : "Line unassigned.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach voice agent.");
    } finally {
      setAttaching(false);
    }
  }

  const normalizedAreaCode = areaCode.replace(/\D/g, "").slice(0, 3);
  const lineMeta = activeNumber
    ? `${attachedAgent?.name || "Unassigned"} · ${formatProvisionedDate(activeNumber.created_at)}`
    : null;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-primary/20 bg-primary p-5 text-primary-foreground shadow-[var(--wireline-elevation-md)] sm:p-7">
        {/*
         * The status chip sits above the number on phones rather than beside it.
         * At 360px this card is 210px of content, and the chip plus its gap took
         * 95px of that — leaving the number 113px and breaking a 28px display
         * heading across three lines. That hit real numbers too, not just this
         * placeholder: "(312) 555-0142" needs 117px on one line. Stacking gives
         * the heading the full 208px; from `sm` up the original row is restored.
         */}
        <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h2 className="truncate font-[var(--wireline-font-family-display)] text-[clamp(1.75rem,1.2rem+2.5vw,2.5rem)] font-normal leading-none tracking-[-0.035em]">
              {formatPhone(activeNumber?.phone_number)}
            </h2>
            {lineMeta ? (
              <p className="mt-3 text-sm text-primary-foreground/78">{lineMeta}</p>
            ) : null}
          </div>
          <span className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg border border-primary-foreground/20 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-foreground/75">
            <span className="size-1.5 rounded-full bg-primary-foreground/70" />
            {activeNumber ? "Active" : "Setup"}
          </span>
        </div>

        {!activeNumber || addingLine ? (
          <div className="mt-6 grid gap-3 rounded-xl border border-primary-foreground/15 bg-black/10 p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold text-primary-foreground/80">
                Voice agent
              </span>
              {agentsLoading ? (
                <div
                  className="flex h-11 items-center rounded-lg border border-primary-foreground/20 bg-black/5 px-3 text-sm text-primary-foreground"
                  role="status"
                >
                  Loading agents…
                </div>
              ) : agents.length ? (
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger
                    aria-label="Choose the voice agent for this number"
                    className="h-11 border-primary-foreground/20 bg-black/5 text-primary-foreground"
                  >
                    <SelectValue placeholder="Select voice agent" />
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
                // An unreachable roster is not an empty one — offering "create
                // an agent" here invites a duplicate of an agent that exists.
                <div
                  className="flex h-11 items-center rounded-lg border border-primary-foreground/20 bg-black/5 px-3 text-sm text-primary-foreground"
                  role="status"
                >
                  Agent list unavailable. Reload to try again.
                </div>
              ) : (
                <Button asChild variant="secondary" className="w-full justify-center">
                  <Link to="/studio?create=1">Create voice agent</Link>
                </Button>
              )}
            </label>

            <label className="block">
              {/* Cased, this label measures ~165px — wider than its old 160px
                  column — and wrapped to two lines, breaking the row's
                  baseline. The column is 180px now; nowrap is the guard. */}
              <span className="mb-1.5 block whitespace-nowrap text-xs font-semibold text-primary-foreground/80">
                Preferred area code
              </span>
              <span className="relative block">
                <MapPin
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary-foreground/55"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={3}
                  value={normalizedAreaCode}
                  onChange={(event) =>
                    setAreaCode(event.target.value.replace(/\D/g, "").slice(0, 3))
                  }
                  placeholder="312"
                  aria-label="Preferred phone number area code"
                  className="h-11 w-full rounded-lg border border-primary-foreground/20 bg-black/5 pl-9 pr-3 text-sm text-primary-foreground outline-none placeholder:text-primary-foreground/55 focus:border-primary-foreground/50 focus:ring-2 focus:ring-primary-foreground/15"
                />
              </span>
            </label>

            <Button
              type="button"
              variant="secondary"
              className="min-h-11 bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              disabled={working || loading || agentsLoading || !selectedAgentId}
              onClick={() => void provisionNumber()}
            >
              <Plus size={16} aria-hidden="true" />
              {working ? "Activating…" : addingLine ? "Activate another number" : "Activate number"}
            </Button>
            <p className="text-xs text-primary-foreground/72 sm:col-span-3">
              Every paid plan includes a dedicated number. If yours needs attention, activation
              points you to Billing.
            </p>
            {addingLine ? (
              <Button
                type="button"
                variant="ghost"
                className="text-primary-foreground/80 sm:col-span-3"
                onClick={() => setAddingLine(false)}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-primary-foreground/15 bg-black/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary-foreground/12">
                <Phone className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Call this number now</p>
              </div>
            </div>
            <Button
              asChild
              variant="secondary"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
            >
              <a href={`tel:${activeNumber.phone_number}`}>Call the line</a>
            </Button>
          </div>
        )}
        {numbers.length > 1 ? (
          <div className="mt-4 grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-foreground/70">
              Your lines
            </p>
            <div className="flex flex-wrap gap-2">
              {numbers.map((number) => (
                <Button
                  key={number.id}
                  type="button"
                  size="sm"
                  variant={number.id === activeNumber?.id ? "secondary" : "ghost"}
                  className={
                    number.id === activeNumber?.id
                      ? "bg-primary-foreground text-primary"
                      : "text-primary-foreground/85 hover:bg-primary-foreground/10"
                  }
                  onClick={() => {
                    setSelectedNumberId(number.id);
                    setAddingLine(false);
                  }}
                >
                  {formatPhone(number.phone_number)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {activeNumber && !addingLine ? (
          <div className="mt-4">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-primary-foreground/85 hover:bg-primary-foreground/10"
              onClick={() => setAddingLine(true)}
            >
              <Plus size={14} aria-hidden="true" />
              Add another number
            </Button>
          </div>
        ) : null}
      </section>

      {activeNumber ? (
        <section className="studio-card p-5 sm:p-6">
          <p className={WL_APP_CLASSES.wiredEyebrow}>Routing</p>
          {attachedAgent ? (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] px-4 py-3">
              <Check
                className="size-4 shrink-0 text-[var(--wireline-color-status-success)]"
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-foreground">{attachedAgent.name}</p>
            </div>
          ) : null}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={activeNumber.agent_id || PHONE_AGENT_UNSET}
              disabled={attaching}
              onValueChange={(value) =>
                void attachAgent(value === PHONE_AGENT_UNSET ? null : value)
              }
            >
              <SelectTrigger
                aria-label="Attach voice agent to this number"
                className="h-auto min-w-[180px] rounded-md border border-input bg-muted px-2.5 py-2 text-sm"
              >
                <SelectValue placeholder="Select voice agent" />
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
            {attachedAgent ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`/studio?agent=${encodeURIComponent(attachedAgent.id)}`}>
                  Open Studio
                </Link>
              </Button>
            ) : null}
            {agents.length === 0 && !agentsDegraded ? (
              <Button asChild size="sm">
                <Link to="/studio?create=1">Create voice agent</Link>
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {message ? (
        <StatusNotice tone="success" title="Calling is ready">
          {message}
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice tone="destructive" title="Calling setup needs attention">
          <div className="space-y-3">
            <p>{error}</p>
            {recoveryPath ? (
              <Button asChild size="sm" variant="outline">
                <Link to={recoveryPath}>Choose a plan and continue setup</Link>
              </Button>
            ) : null}
          </div>
        </StatusNotice>
      ) : null}

      <CompanyIdentityPack key={activeNumber?.id ?? "no-number"} />
    </div>
  );
}
