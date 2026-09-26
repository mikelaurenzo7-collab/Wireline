import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin, Phone, Plus } from "lucide-react";
import { Link, useLocation } from "react-router";

import { Button, EmptyState } from "./atoms";
import { StatusNotice } from "./molecules";
import CompanyIdentityPack from "./settings/CompanyIdentityPack";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { useAgents } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";
import {
  fetchSelfServeCheckoutAvailable,
  isBillingSettingsPath,
} from "../lib/checkout-availability";
import { SOFT_OPEN_CHECKOUT_COPY } from "../lib/wireline-onboarding-copy";

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

export default function PhoneSetupPanel({ initialAgentId = "" }: { initialAgentId?: string }) {
  const { agents, loading: agentsLoading, degraded: agentsDegraded } = useAgents();
  const location = useLocation();
  const [numbers, setNumbers] = useState<PhoneNumberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [inventoryUnavailable, setInventoryUnavailable] = useState(false);
  const [working, setWorking] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [areaCode, setAreaCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryPath, setRecoveryPath] = useState<string | null>(null);
  const [checkoutAvailable, setCheckoutAvailable] = useState<boolean | null>(null);
  const [selectedNumberId, setSelectedNumberId] = useState<string | null>(null);
  const [addingLine, setAddingLine] = useState(false);
  const companyIdentityRef = useRef<HTMLDetailsElement>(null);
  const previousPreferredAgentRef = useRef("");
  const appliedLinePreferenceRef = useRef("");
  const preferredAgentId = agents.some((agent) => agent.id === initialAgentId)
    ? initialAgentId
    : "";

  const activeNumber =
    numbers.find((number) => number.id === selectedNumberId) || numbers[0] || null;
  const attachedAgent = useMemo(
    () => agents.find((agent) => agent.id === activeNumber?.agent_id),
    [activeNumber?.agent_id, agents],
  );

  useEffect(() => {
    if (location.hash !== "#company-identity") return;
    const id = window.setTimeout(() => {
      const section = companyIdentityRef.current;
      if (!section) return;
      section.open = true;
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.hash]);

  useEffect(() => {
    // The new-line form is independent of the line currently being inspected.
    // Apply new Studio context once, without undoing edits on a roster refresh.
    const preferenceChanged = previousPreferredAgentRef.current !== preferredAgentId;
    previousPreferredAgentRef.current = preferredAgentId;
    setSelectedAgentId((current) =>
      preferenceChanged && preferredAgentId
        ? preferredAgentId
        : agents.some((agent) => agent.id === current)
          ? current
          : preferredAgentId || agents[0]?.id || "",
    );
  }, [agents, preferredAgentId]);

  useEffect(() => {
    if (!preferredAgentId) {
      appliedLinePreferenceRef.current = "";
      return;
    }
    if (loading || inventoryUnavailable || appliedLinePreferenceRef.current === preferredAgentId)
      return;
    appliedLinePreferenceRef.current = preferredAgentId;
    const preferred = numbers.find((number) => number.agent_id === preferredAgentId);
    if (preferred) {
      setSelectedNumberId(preferred.id);
      setAddingLine(false);
    } else {
      setAddingLine(true);
    }
  }, [preferredAgentId, numbers, loading, inventoryUnavailable]);

  async function loadNumbers(preferredAgentId?: string) {
    setLoading(true);
    setError(null);
    setRecoveryPath(null);
    setCheckoutAvailable(null);
    try {
      const response = await authFetch("/api/phone-numbers");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Phone numbers unavailable.");
      if (!Array.isArray(body?.numbers))
        throw new Error("Phone numbers could not be verified. Try again.");
      const nextNumbers: PhoneNumberRecord[] = body.numbers;
      setNumbers(nextNumbers);
      setInventoryUnavailable(false);
      setSelectedNumberId((current) => {
        const preferred = preferredAgentId
          ? nextNumbers.find((number) => number.agent_id === preferredAgentId)
          : undefined;
        return (
          preferred?.id ??
          (current && nextNumbers.some((number) => number.id === current)
            ? current
            : (nextNumbers[0]?.id ?? null))
        );
      });
    } catch (reason) {
      setInventoryUnavailable(true);
      setError(reason instanceof Error ? reason.message : "Phone numbers unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNumbers();
  }, []);

  async function provisionNumber() {
    if (working || loading || inventoryUnavailable || !selectedAgentId) return;
    const requestedAreaCode = areaCode.replace(/\D/g, "").slice(0, 3);
    if (requestedAreaCode && requestedAreaCode.length !== 3) {
      setError("Enter a 3-digit area code, or leave it blank.");
      return;
    }
    setWorking(true);
    setMessage(null);
    setError(null);
    setRecoveryPath(null);
    setCheckoutAvailable(null);
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
        const nextRecoveryPath =
          body.recovery_path ||
          (body.code === "ACTIVATION_REQUIRED" || body.code === "SUBSCRIPTION_REQUIRED"
            ? "/settings/billing"
            : null);
        setRecoveryPath(nextRecoveryPath);
        if (isBillingSettingsPath(nextRecoveryPath)) {
          const available = await fetchSelfServeCheckoutAvailable();
          setCheckoutAvailable(available);
          throw new Error(
            available
              ? body.error || "Could not activate a number."
              : SOFT_OPEN_CHECKOUT_COPY.detail,
          );
        }
        throw new Error(body.error || "Could not activate a number.");
      }
      setMessage(body.reused ? "Existing line connected." : "Line activated.");
      await loadNumbers(selectedAgentId);
      setAddingLine(false);
      setAreaCode("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not activate a number.");
    } finally {
      setWorking(false);
    }
  }

  async function attachAgent(agentId: string | null) {
    if (!activeNumber || attaching || loading || inventoryUnavailable) return;
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
          <p className="mt-0.5 text-xs text-muted-foreground">
            {loading
              ? "Checking lines…"
              : inventoryUnavailable
                ? "Lines unavailable"
                : `${numbers.length} active`}
          </p>
        </div>
        {numbers.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setAddingLine((value) => !value)}
            disabled={loading || inventoryUnavailable || working}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add line
          </Button>
        ) : null}
      </div>

      {error ? (
        <StatusNotice
          tone="destructive"
          title={
            checkoutAvailable === false ? SOFT_OPEN_CHECKOUT_COPY.title : "Lines Need Attention"
          }
          action={
            recoveryPath ? (
              checkoutAvailable === false ? (
                <Button asChild size="sm" variant="secondary">
                  <Link to={SOFT_OPEN_CHECKOUT_COPY.href}>{SOFT_OPEN_CHECKOUT_COPY.cta}</Link>
                </Button>
              ) : checkoutAvailable === true ? (
                <Button asChild size="sm" variant="secondary">
                  <Link to={recoveryPath}>Open billing</Link>
                </Button>
              ) : undefined
            ) : inventoryUnavailable ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void loadNumbers()}
                disabled={loading}
              >
                Retry
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
      ) : !inventoryUnavailable && numbers.length === 0 && !addingLine ? (
        <EmptyState
          framed
          density="compact"
          titleTone="ui"
          withHalo={false}
          icon={<Phone className="size-5" aria-hidden="true" />}
          title="No Line Yet"
          description="Add a number when this Bot is ready for real calls."
          action={
            <Button type="button" onClick={() => setAddingLine(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add line
            </Button>
          }
        />
      ) : null}

      {addingLine && !inventoryUnavailable ? (
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
                <Select
                  value={selectedAgentId}
                  onValueChange={setSelectedAgentId}
                  disabled={working || loading}
                >
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
              <span className="text-xs font-semibold text-foreground">Area Code (Optional)</span>
              <span className="relative block">
                <MapPin
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  disabled={working || loading}
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
              disabled={
                working || loading || inventoryUnavailable || agentsLoading || !selectedAgentId
              }
            >
              {working ? "Activating…" : "Activate Line"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAddingLine(false)}
              disabled={working}
            >
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {numbers.length > 0 && !inventoryUnavailable ? (
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
                  aria-pressed={selected}
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
                  disabled={attaching || agentsLoading || loading || working}
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
        ref={companyIdentityRef}
        id="company-identity"
        className="rounded-xl border border-border bg-card"
        data-visual-qa-state={
          location.hash === "#company-identity" ? "company-identity" : undefined
        }
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
          Caller Identity
        </summary>
        <div className="border-t border-border p-4">
          <CompanyIdentityPack />
        </div>
      </details>
    </div>
  );
}
