import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Loader2, Phone } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./atoms/Dialog";
import { Button } from "./atoms";
import { Checkbox } from "./ui/shadcn/Checkbox";
import { useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { authFetch } from "../lib/api";
import {
  OUTBOUND_CONSENT_HELP,
  OUTBOUND_CONSENT_LABEL,
  OUTBOUND_CONSENT_LEARN_MORE,
  OUTBOUND_CONSENT_LEGAL_PATH,
} from "../lib/outbound-consent-copy";
import {
  DIRECT_OUTBOUND_AVAILABILITY,
  type OutboundCallPurpose,
} from "../lib/outbound-call-purpose";
import { emitProductEvent } from "../lib/product-event-client";
import PhoneTestDialog from "./PhoneTestDialog";
import { listVoicePermissions } from "../lib/voice-permission-client";
import type { VoicePermissionSummary } from "../lib/recipient-voice-permission-contract";
import {
  clearPendingOutboundDial,
  isConfirmedTerminalDial,
  readPendingOutboundDial,
  savePendingOutboundDial,
  type PendingOutboundDial,
} from "../lib/outbound-dial-recovery";

type OutboundDialDialogProps = {
  open: boolean;
  onClose: () => void;
  initialAgentId?: string;
  initialNumber?: string;
  initialContext?: string;
};

export default function OutboundDialDialog(props: OutboundDialDialogProps) {
  const { agents, loading, degraded, phoneLookupDegraded } = useAgents();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState(props.initialAgentId || "");
  useEffect(() => {
    if (props.open) setSelectedId(props.initialAgentId || "");
  }, [props.open, props.initialAgentId]);
  const voiceAgents = agents.filter(
    (agent) =>
      agent.phone_number &&
      (agent.channel === "voice" || agent.channel === "omnichannel" || !agent.channel),
  );
  const selected = voiceAgents.find((agent) => agent.id === selectedId) || voiceAgents[0];
  if (DIRECT_OUTBOUND_AVAILABILITY.available && user)
    return <DirectOutboundDialDialog key={user.id} {...props} userId={user.id} />;
  if (selected && !loading && !degraded && !phoneLookupDegraded)
    return (
      <PhoneTestDialog
        open={props.open}
        onClose={props.onClose}
        agentId={selected.id}
        agentName={selected.name}
        agents={voiceAgents}
        onAgentChange={setSelectedId}
      />
    );
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Phone test</DialogTitle>
          <DialogDescription>
            {loading
              ? "Loading your Bots…"
              : degraded || phoneLookupDegraded
                ? "Could not load your phone lines. Close this window and try again."
                : "Connect a phone number to try your Bot on your own phone."}
          </DialogDescription>
        </DialogHeader>
        {!loading && !degraded && !phoneLookupDegraded ? (
          <Button asChild>
            <Link to="/phone?tab=setup" onClick={props.onClose}>
              Connect a number
            </Link>
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DirectOutboundDialDialog({
  open,
  onClose,
  initialAgentId = "",
  initialNumber = "",
  initialContext = "",
  userId,
}: OutboundDialDialogProps & { userId: string }) {
  const { agents, loading, degraded, phoneLookupDegraded } = useAgents();
  const { toast } = useToast();
  const voiceAgents = useMemo(
    () =>
      agents.filter(
        (agent) =>
          agent.phone_number &&
          (agent.channel === "voice" || agent.channel === "omnichannel" || !agent.channel),
      ),
    [agents],
  );

  const [agentId, setAgentId] = useState(initialAgentId);
  const [number, setNumber] = useState(initialNumber);
  const [context, setContext] = useState(initialContext);
  const [callPurpose, setCallPurpose] = useState<OutboundCallPurpose>("service_or_requested");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [permissions, setPermissions] = useState<VoicePermissionSummary[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsError, setPermissionsError] = useState("");
  const [consentArtifactId, setConsentArtifactId] = useState("");
  const [savedRecovery] = useState(() => {
    try {
      return { pending: readPendingOutboundDial(userId, sessionStorage), error: "" };
    } catch {
      return {
        pending: null,
        error: "Saved call status could not be read. Check call history before another request.",
      };
    }
  });
  const [uncertain, setUncertain] = useState(!!savedRecovery.pending);
  const [recoveryError, setRecoveryError] = useState(savedRecovery.error);
  const [reconciling, setReconciling] = useState(false);
  const [missingRequest, setMissingRequest] = useState(false);
  const pendingRef = useRef<PendingOutboundDial | null>(savedRecovery.pending);
  const reconcilingRef = useRef(false);
  const placingRef = useRef(false);
  const requestRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const openingUrlRef = useRef("");
  const closingForNavigationRef = useRef(false);

  const closeForNavigation = () => {
    closingForNavigationRef.current = true;
    onClose();
  };

  // Reset the form when the dialog opens or its seed values change — but NOT
  // when the agents list refreshes in the background. Keeping `voiceAgents` in
  // the deps here wiped whatever the user had typed the moment AgentsContext
  // refetched (or finished its initial load) while the dialog was open.
  useEffect(() => {
    if (!open || placingRef.current || pendingRef.current) return;
    setAgentId(initialAgentId);
    setNumber(initialNumber);
    setContext(initialContext);
    setCallPurpose("service_or_requested");
    setConsentConfirmed(false);
    setConsentArtifactId("");
    setUncertain(false);
    requestRef.current = null;
  }, [open, initialAgentId, initialNumber, initialContext]);

  const refreshCallStatus = useCallback(
    async (signal?: AbortSignal) => {
      const pending = pendingRef.current;
      if (!pending || reconcilingRef.current) return;
      reconcilingRef.current = true;
      setReconciling(true);
      try {
        const response = await authFetch(
          `/api/outbound/dial/${encodeURIComponent(pending.requestKey)}`,
          { signal },
        );
        const body: unknown = await response.json();
        if (signal?.aborted) return;
        setMissingRequest(response.status === 404);
        if (!response.ok)
          throw new Error(
            "Call status is not confirmed yet. Check History before another request.",
          );
        if (isConfirmedTerminalDial(body, pending.requestKey)) {
          clearPendingOutboundDial(userId, pending.requestKey, sessionStorage);
          pendingRef.current = null;
          requestRef.current = null;
          setUncertain(false);
          setRecoveryError("");
          setMissingRequest(false);
        }
      } catch (error) {
        if (!signal?.aborted)
          setRecoveryError(
            error instanceof Error ? error.message : "Call status is not confirmed yet.",
          );
      } finally {
        reconcilingRef.current = false;
        setReconciling(false);
      }
    },
    [userId],
  );

  const cancelMissingRequest = async () => {
    const pending = pendingRef.current;
    if (!pending || placingRef.current || reconcilingRef.current || !missingRequest) return;
    reconcilingRef.current = true;
    setReconciling(true);
    try {
      const response = await authFetch(
        `/api/outbound/dial/${encodeURIComponent(pending.requestKey)}/cancel-missing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const body: unknown = await response.json();
      if (!response.ok || !isConfirmedTerminalDial(body, pending.requestKey)) {
        throw new Error(
          "The request could not be canceled. Refresh call status before another request.",
        );
      }
      clearPendingOutboundDial(userId, pending.requestKey, sessionStorage);
      pendingRef.current = null;
      requestRef.current = null;
      setUncertain(false);
      setMissingRequest(false);
      setRecoveryError("");
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "Cancellation is not confirmed.");
    } finally {
      reconcilingRef.current = false;
      setReconciling(false);
    }
  };

  useEffect(() => {
    if (!open || !pendingRef.current) return;
    const controller = new AbortController();
    void refreshCallStatus(controller.signal);
    return () => controller.abort();
  }, [open, refreshCallStatus]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setPermissionsLoading(true);
    setPermissionsError("");
    setPermissions([]);
    void listVoicePermissions(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setPermissions(rows);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setPermissionsError(
            failure instanceof Error ? failure.message : "Could not load permissions.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPermissionsLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    setConsentArtifactId("");
  }, [agentId, callPurpose, number]);

  // Keep the selected agent valid without disturbing typed fields: seed a
  // fallback when nothing is chosen yet, and drop a selection that no longer
  // exists in the roster (agent deleted or lost its phone line on a background
  // refresh) so placeCall can't submit a stale id the <select> no longer shows.
  useEffect(() => {
    if (!open || placing || uncertain || voiceAgents.length === 0) return;
    if (agentId && voiceAgents.some((agent) => agent.id === agentId)) return;
    const fallback =
      (initialAgentId && voiceAgents.some((agent) => agent.id === initialAgentId)
        ? initialAgentId
        : voiceAgents[0]?.id) || "";
    if (fallback && fallback !== agentId) setAgentId(fallback);
  }, [open, agentId, initialAgentId, voiceAgents, placing, uncertain]);

  const availablePermissions = permissions.filter(
    (permission) =>
      permission.status === "granted" &&
      permission.agent_id === agentId &&
      permission.purpose === callPurpose,
  );
  const canPlace =
    !placing &&
    !uncertain &&
    !recoveryError &&
    !permissionsLoading &&
    !permissionsError &&
    !!agentId &&
    availablePermissions.some((permission) => permission.id === consentArtifactId) &&
    number.trim().length > 0 &&
    (callPurpose !== "marketing_or_sales" || consentConfirmed) &&
    voiceAgents.length > 0;

  const placeCall = async () => {
    if (!canPlace || placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    try {
      const digits = number.replace(/\D/g, "");
      const payload = {
        agentId,
        customerNumber: `+${digits.length === 10 ? `1${digits}` : digits}`,
        customerName: "",
        context: context.trim() || undefined,
        callPurpose,
        consentArtifactId,
      };
      const fingerprint = JSON.stringify(payload);
      if (requestRef.current?.fingerprint !== fingerprint) {
        requestRef.current = { fingerprint, key: crypto.randomUUID() };
      }
      // Persist the operation before dispatch so close/reopen/reload cannot silently redial.
      // No recipient or instruction data is stored in the browser.
      savePendingOutboundDial(userId, requestRef.current.key, sessionStorage);
      pendingRef.current = { requestKey: requestRef.current.key };
      setUncertain(true);
      const response = await authFetch("/api/outbound/dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          requestKey: requestRef.current.key,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        code?: string;
        callId?: string;
        doNotRetry?: boolean;
        providerOutcomeAmbiguous?: boolean;
      };
      if (response.status === 202 || body.doNotRetry || body.providerOutcomeAmbiguous) {
        setUncertain(true);
        return;
      }
      if (!response.ok) {
        if (response.status >= 500 || response.status === 408) return;
        clearPendingOutboundDial(userId, requestRef.current.key, sessionStorage);
        pendingRef.current = null;
        requestRef.current = null;
        setUncertain(false);
        toast({
          type: "error",
          title: "Call Not Placed",
          message: body.error || "Outbound dial was blocked.",
          duration: 10_000,
        });
        return;
      }
      if (typeof body.callId !== "string" || !body.callId) {
        setUncertain(true);
        return;
      }
      toast({
        type: "success",
        title: "Call Started",
        message: "Your Bot is dialing now.",
      });
      emitProductEvent({
        event: "outbound_call_started",
        agentId,
        metadata: { channel: "outbound_dial" },
      });
      onClose();
    } catch {
      setUncertain(!!pendingRef.current);
      if (!pendingRef.current)
        setRecoveryError("Could not retain call status. The call was not requested.");
      toast({
        type: "error",
        title: pendingRef.current ? "Call status unknown" : "Call not requested",
        message: pendingRef.current
          ? "Check call history before starting another request."
          : "Could not retain call status. Check browser storage and try again.",
      });
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !placing) onClose();
      }}
    >
      <DialogContent
        showClose={!placing}
        aria-busy={placing}
        onOpenAutoFocus={() => {
          // Controlled callers have no DialogTrigger for Radix to restore.
          openerRef.current =
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body
              ? document.activeElement
              : null;
          openingUrlRef.current = window.location.href;
          closingForNavigationRef.current = false;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const opener = openerRef.current;
          openerRef.current = null;
          // Destination-page focus takes precedence when a link leaves the dialog.
          if (closingForNavigationRef.current || openingUrlRef.current !== window.location.href) {
            return;
          }
          if (
            opener?.isConnected &&
            opener.getClientRects().length &&
            !opener.matches(":disabled")
          ) {
            opener.focus({ preventScroll: true });
          }
        }}
        onEscapeKeyDown={(event) => {
          if (placing) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (placing) event.preventDefault();
        }}
        className="flex max-w-md flex-col gap-0 overflow-hidden border-border bg-[var(--wireline-color-surface-default)] p-0 shadow-2xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-2 font-[var(--wireline-font-family-display)] text-xl font-normal tracking-[-0.02em]">
            <Phone className="h-4 w-4 text-primary" aria-hidden />
            New Outbound Call
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Pick a Bot with a phone number and choose who to call.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex items-center gap-2 px-6 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading Bots…
            </div>
          ) : voiceAgents.length === 0 && (degraded || phoneLookupDegraded) ? (
            // "None with a phone line yet" is a claim about the roster and about
            // which numbers are attached. When either lookup is what failed, it
            // is not a claim we can make — `voiceAgents` is empty because we
            // could not ask, not because the answer is none.
            <p className="px-6 py-8 text-sm text-muted-foreground" role="status">
              {degraded
                ? "Your Bot list could not be loaded. Close this and try again in a moment."
                : "We could not check which numbers are attached. Close this and try again in a moment."}
            </p>
          ) : voiceAgents.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              No Bots with a phone line yet.{" "}
              <Link
                to="/studio?create=1"
                onClick={closeForNavigation}
                className="text-brand underline underline-offset-2"
              >
                Create and activate one in Studio
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-4 px-6 py-5">
              <label className="block space-y-1.5">
                <span className="block text-sm font-semibold text-foreground">Bot</span>
                <select
                  className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                  value={agentId}
                  disabled={placing || uncertain}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  {voiceAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-semibold text-foreground">Phone number</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+1 (415) 555-0142"
                  className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                  value={number}
                  disabled={placing || uncertain}
                  onChange={(event) => setNumber(event.target.value)}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-semibold text-foreground">
                  Instruction (optional)
                </span>
                <textarea
                  rows={3}
                  className="min-h-[88px] w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                  value={context}
                  disabled={placing || uncertain}
                  onChange={(event) => setContext(event.target.value)}
                  placeholder="What should the Bot accomplish on this call?"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-semibold text-foreground">Call type</span>
                <select
                  className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                  value={callPurpose}
                  disabled={placing || uncertain}
                  onChange={(event) => {
                    setCallPurpose(event.target.value as OutboundCallPurpose);
                    setConsentConfirmed(false);
                  }}
                >
                  <option value="service_or_requested">Service or requested call</option>
                  <option value="callback">Callback</option>
                  <option value="marketing_or_sales">Marketing or sales</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-semibold text-foreground">
                  Recipient permission
                </span>
                <select
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm wl-focus-ring-halo"
                  value={consentArtifactId}
                  onChange={(event) => setConsentArtifactId(event.target.value)}
                  disabled={permissionsLoading || !!permissionsError || placing || uncertain}
                >
                  <option value="">
                    {permissionsLoading ? "Loading permissions…" : "Choose a granted permission"}
                  </option>
                  {availablePermissions.map((permission) => (
                    <option key={permission.id} value={permission.id}>
                      {permission.recipient_phone_masked}
                    </option>
                  ))}
                </select>
              </label>
              {permissionsError ? (
                <p role="alert" className="text-sm text-destructive">
                  {permissionsError}
                </p>
              ) : null}
              <Link
                to="/phone?tab=outbound"
                onClick={closeForNavigation}
                className="text-sm text-brand underline underline-offset-2"
              >
                Manage recipient permissions
              </Link>
              {uncertain ? (
                <p role="status" className="text-sm text-foreground">
                  Call status is being reconciled. Check History before starting another call.
                </p>
              ) : null}
              {recoveryError ? (
                <p role="alert" className="text-sm text-destructive">
                  {recoveryError}
                </p>
              ) : null}
              {uncertain && missingRequest ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={placing || reconciling}
                  onClick={() => void cancelMissingRequest()}
                >
                  Cancel pending request
                </Button>
              ) : null}
              {uncertain ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={placing || reconciling}
                  onClick={() => void refreshCallStatus()}
                >
                  {reconciling ? "Checking status…" : "Refresh call status"}
                </Button>
              ) : null}

              {callPurpose === "marketing_or_sales" ? (
                <label className="flex items-start gap-3 rounded-md border border-input/80 bg-muted/30 p-3">
                  <Checkbox
                    className="mt-1"
                    checked={consentConfirmed}
                    disabled={placing || uncertain}
                    onChange={(event) => setConsentConfirmed(event.target.checked)}
                  />
                  <span className="space-y-1 text-sm">
                    <span className="block text-foreground">{OUTBOUND_CONSENT_LABEL}</span>
                    <span className="block text-muted-foreground text-xs">
                      {OUTBOUND_CONSENT_HELP}
                    </span>
                    <Link
                      to={OUTBOUND_CONSENT_LEGAL_PATH}
                      onClick={closeForNavigation}
                      className="text-xs text-brand underline-offset-2 hover:underline"
                    >
                      {OUTBOUND_CONSENT_LEARN_MORE}
                    </Link>
                  </span>
                </label>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border bg-[var(--wireline-color-surface-default)] px-6 py-4 sm:gap-0">
          <Button type="button" variant="secondary" onClick={onClose} disabled={placing}>
            {uncertain ? "Close" : "Cancel"}
          </Button>
          {uncertain ? (
            <Button asChild variant="secondary">
              <Link to="/phone?tab=logs" onClick={closeForNavigation}>
                Check call history
              </Link>
            </Button>
          ) : null}
          <Button type="button" onClick={() => void placeCall()} disabled={!canPlace}>
            {placing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Placing…
              </>
            ) : (
              "Place call"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
