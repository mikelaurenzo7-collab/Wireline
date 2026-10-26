import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Copy, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button, Input } from "../atoms";
import { useAgents } from "../../contexts/AgentsContext";
import { useAuth } from "../../contexts/AuthContext";
import { isReviewedOutboundCandidate } from "../../lib/outbound-call-purpose";
import { authFetch } from "../../lib/api";
import {
  checkedVoicePermissionLink,
  isVoicePermissionSummary,
  listVoicePermissions,
} from "../../lib/voice-permission-client";
import type {
  VoicePermissionPurpose,
  VoicePermissionSummary,
} from "../../lib/recipient-voice-permission-contract";
import {
  isUsCallingState,
  timeZonesForCallingState,
  US_CALLING_STATE_CODES,
  usCallingStateName,
} from "../../lib/us-calling-jurisdiction";

const PURPOSE_LABELS: Record<VoicePermissionPurpose, string> = {
  callback: "Requested callback",
  service_or_requested: "Service calls",
  marketing_or_sales: "Marketing calls",
};
const STATUS_LABELS: Record<VoicePermissionSummary["status"], string> = {
  pending: "Awaiting recipient",
  granted: "Granted",
  revoked: "Revoked",
  expired: "Expired",
  used: "Used",
};
const SELECT_CLASS =
  "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground wl-focus-ring-halo md:text-sm";

export default function RecipientVoicePermissions() {
  const { user } = useAuth();
  return user ? <OwnedRecipientVoicePermissions key={user.id} /> : null;
}

function OwnedRecipientVoicePermissions() {
  const { agents, loading: agentsLoading, degraded } = useAgents();
  const callingAgents = agents.filter((agent) => isReviewedOutboundCandidate(agent));
  const [rows, setRows] = useState<VoicePermissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsIdentity, setNeedsIdentity] = useState(false);
  const [editing, setEditing] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [phone, setPhone] = useState("");
  const [recipientState, setRecipientState] = useState("");
  const [recipientTimeZone, setRecipientTimeZone] = useState("");
  const [purpose, setPurpose] = useState<VoicePermissionPurpose>("callback");
  const [pending, setPending] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState("");
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);
  const mutation = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);

  const refresh = useCallback(async () => {
    if (mutation.current) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const epoch = ++generation.current;
    setLoading(true);
    setError("");
    setNeedsIdentity(false);
    try {
      const permissions = await listVoicePermissions(active.signal);
      if (mounted.current && epoch === generation.current) setRows(permissions);
    } catch (failure) {
      if (mounted.current && !active.signal.aborted && epoch === generation.current) {
        setError(failure instanceof Error ? failure.message : "Could not load permissions.");
      }
    } finally {
      if (mounted.current && epoch === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [refresh]);

  async function change(
    operation: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<boolean> {
    if (mutation.current) return false;
    mutation.current = true;
    controller.current?.abort();
    ++generation.current;
    setLoading(false);
    setPending(operation);
    setError("");
    setNeedsIdentity(false);
    setNotice("");
    setLink("");
    try {
      const response = await authFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
        permission?: unknown;
        capture_url?: unknown;
      } | null;
      if (!response.ok) {
        if (mounted.current) setNeedsIdentity(result?.code === "CALLER_IDENTITY_REQUIRED");
        throw new Error(result?.error || "Could not confirm the change.");
      }
      if (operation.startsWith("link:")) {
        const captureUrl = checkedVoicePermissionLink(result?.capture_url, window.location.origin);
        if (mounted.current) setLink(captureUrl);
      } else {
        if (!isVoicePermissionSummary(result?.permission)) {
          throw new Error("Could not confirm the change. Refresh before trying again.");
        }
        const updated = result.permission;
        if (operation.startsWith("revoke:") && updated.status !== "revoked") {
          throw new Error("Could not confirm revocation. Refresh before trying again.");
        }
        if (operation.startsWith("revoke:") && updated.id !== operation.slice(7)) {
          throw new Error("Could not confirm revocation. Refresh before trying again.");
        }
        const captureUrl =
          operation === "create"
            ? checkedVoicePermissionLink(result?.capture_url, window.location.origin)
            : "";
        if (mounted.current) {
          setRows((current) => [updated, ...current.filter((row) => row.id !== updated.id)]);
          setConfirmRevoke("");
          if (operation === "create") {
            setEditing(false);
            setPhone("");
            request.current = null;
            setLink(captureUrl);
          } else {
            setNotice("Permission revoked.");
          }
        }
      }
      return true;
    } catch (failure) {
      if (mounted.current) {
        setError(failure instanceof Error ? failure.message : "Could not confirm the change.");
      }
      return false;
    } finally {
      mutation.current = false;
      if (mounted.current) setPending("");
    }
  }

  function create(event: FormEvent) {
    event.preventDefault();
    if (
      mutation.current ||
      !callingAgents.some((agent) => agent.id === agentId) ||
      purpose === "marketing_or_sales" ||
      !phone.trim() ||
      !isUsCallingState(recipientState) ||
      !timeZonesForCallingState(recipientState).includes(recipientTimeZone) ||
      degraded
    )
      return;
    const payload = {
      agent_id: agentId,
      phone: phone.trim(),
      call_purpose: purpose,
      recipient_state: recipientState,
      recipient_time_zone: recipientTimeZone,
    };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) {
      request.current = { fingerprint, key: crypto.randomUUID() };
    }
    void change("create", "/api/voice-permissions", {
      ...payload,
      request_key: request.current.key,
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      if (mounted.current) setNotice("Link copied. Share it directly with the recipient.");
    } catch {
      if (mounted.current) setNotice("Select the link below to copy it.");
    }
  }

  return (
    <section aria-label="Recipient permissions" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Create a link for the recipient to review.</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void refresh()}
            disabled={!!pending || loading}
            aria-label="Refresh permissions"
          >
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setEditing(!editing)}
            disabled={!!pending}
          >
            <Plus aria-hidden /> New permission
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
          {needsIdentity ? (
            <>
              {" "}
              <Link to="/phone?tab=setup#company-identity" className="underline underline-offset-2">
                Caller Identity settings
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-foreground">
          {notice}
        </p>
      ) : null}
      {link ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <label className="block space-y-1 text-sm">
            <span>Permission link</span>
            <Input
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
              autoComplete="off"
            />
          </label>
          <Button size="sm" variant="secondary" onClick={() => void copy()}>
            <Copy aria-hidden /> Copy link
          </Button>
        </div>
      ) : null}
      {editing ? (
        <form
          onSubmit={create}
          className="space-y-3 rounded-lg border border-border p-3"
          aria-label="New recipient permission"
        >
          <label className="block space-y-1 text-sm">
            <span>Bot</span>
            <select
              className={SELECT_CLASS}
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              disabled={!!pending || agentsLoading || degraded}
              required
            >
              <option value="">Choose a Bot</option>
              {callingAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>Recipient phone</span>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={!!pending}
              placeholder="+1 (312) 555-0123"
              required
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Purpose</span>
            <select
              className={SELECT_CLASS}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value as VoicePermissionPurpose)}
              disabled={!!pending}
            >
              {Object.entries(PURPOSE_LABELS)
                .filter(([id]) => id !== "marketing_or_sales")
                .map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>Recipient location</span>
            <select
              className={SELECT_CLASS}
              value={recipientState}
              onChange={(event) => {
                const state = event.target.value;
                setRecipientState(state);
                setRecipientTimeZone(timeZonesForCallingState(state)[0] || "");
              }}
              disabled={!!pending}
              required
            >
              <option value="">Choose the recipient's state</option>
              {US_CALLING_STATE_CODES.map((code) => (
                <option key={code} value={code}>
                  {usCallingStateName(code)}
                </option>
              ))}
            </select>
          </label>
          {timeZonesForCallingState(recipientState).length > 1 ? (
            <label className="block space-y-1 text-sm">
              <span>Recipient time zone</span>
              <select
                className={SELECT_CLASS}
                value={recipientTimeZone}
                onChange={(event) => setRecipientTimeZone(event.target.value)}
                disabled={!!pending}
                required
              >
                {timeZonesForCallingState(recipientState).map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Creating a link does not place a call or grant permission.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={
                !!pending ||
                !agentId ||
                !phone.trim() ||
                !isUsCallingState(recipientState) ||
                !recipientTimeZone ||
                degraded
              }
            >
              {pending === "create" ? <Loader2 className="animate-spin" aria-hidden /> : null}Create
              link
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={!!pending}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {loading && !rows.length ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading permissions…
        </p>
      ) : rows.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 text-sm">
                <p className="break-words font-medium">
                  {row.recipient_phone_masked}{" "}
                  <span className="font-normal text-muted-foreground">{row.bot_name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {PURPOSE_LABELS[row.purpose]} · {STATUS_LABELS[row.status]}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {row.status === "pending" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void change(
                        `link:${row.id}`,
                        `/api/voice-permissions/${encodeURIComponent(row.id)}/link`,
                      )
                    }
                    disabled={!!pending}
                  >
                    Get link
                  </Button>
                ) : null}
                {["pending", "granted"].includes(row.status) ? (
                  confirmRevoke === row.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          void change(
                            `revoke:${row.id}`,
                            `/api/voice-permissions/${encodeURIComponent(row.id)}/revoke`,
                          )
                        }
                        disabled={!!pending}
                      >
                        Confirm revoke
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmRevoke("")}
                        disabled={!!pending}
                      >
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmRevoke(row.id)}
                      disabled={!!pending}
                    >
                      Revoke
                    </Button>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : !error ? (
        <p className="text-sm text-muted-foreground">No recipient permissions yet.</p>
      ) : null}
    </section>
  );
}
