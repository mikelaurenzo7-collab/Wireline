import { useCallback, useEffect, useRef, useState } from "react";
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
import { useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { isReviewedOutboundCandidate, salesContentWarning } from "../lib/outbound-call-purpose";
import {
  OUTBOUND_CONSENT_LABEL,
  OUTBOUND_CONSENT_LEGAL_PATH,
} from "../lib/outbound-consent-copy";
import OutboundPurposePicker, {
  SalesAttestationCheckbox,
  type OutboundPurposeChoice,
} from "./outbound/OutboundPurposePicker";
import { authFetch } from "../lib/api";
import { emitProductEvent } from "../lib/product-event-client";
import type { PreparedCall } from "../lib/prepared-call-contract";
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
  preparedCall?: PreparedCall;
};

export default function OutboundDialDialog(props: OutboundDialDialogProps) {
  const { user } = useAuth();
  return user ? <DirectOutboundDialDialog key={user.id} {...props} userId={user.id} /> : null;
}

function DirectOutboundDialDialog({
  open,
  onClose,
  initialAgentId = "",
  initialNumber = "",
  initialContext = "",
  preparedCall,
  userId,
}: OutboundDialDialogProps & { userId: string }) {
  const { agents, loading, degraded, phoneLookupDegraded } = useAgents();
  const { toast } = useToast();
  const [purpose, setPurpose] = useState<OutboundPurposeChoice>("appointment_service");
  const [relationship, setRelationship] = useState(false);
  const [permissionStored, setPermissionStored] = useState(false);
  const [nonsalesStored, setNonsalesStored] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [nonsalesChecked, setNonsalesChecked] = useState(false);
  const [customerSince, setCustomerSince] = useState("");
  const [salesAttestationRecorded, setSalesAttestationRecorded] = useState(false);
  const [salesAttestationChecked, setSalesAttestationChecked] = useState(false);
  const [purposeTouched, setPurposeTouched] = useState(false);
  const preparedPurpose = preparedCall?.call_purpose ?? null;
  const callPurpose =
    preparedPurpose ?? (relationship && purpose === "sales" ? "returning_contact" : purpose);
  const salesCall = callPurpose === "sales";

  const [agentId, setAgentId] = useState(initialAgentId);
  const [number, setNumber] = useState(initialNumber);
  const [context, setContext] = useState(initialContext);
  const [placing, setPlacing] = useState(false);
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
    setPurpose("appointment_service");
    setRelationship(false);
    setPermissionStored(false);
    setNonsalesStored(false);
    setPermissionChecked(false);
    setNonsalesChecked(false);
    setCustomerSince("");
    setSalesAttestationRecorded(false);
    setSalesAttestationChecked(false);
    setPurposeTouched(false);
    setUncertain(false);
    requestRef.current = null;
  }, [open, initialAgentId, initialNumber, initialContext, preparedCall]);

  useEffect(() => {
    if (!open || preparedCall) return;
    const digits = number.replace(/\D/g, "");
    if (digits.length < 10) return;
    const phone = `+${digits.length === 10 ? `1${digits}` : digits}`;
    const controller = new AbortController();
    void authFetch(`/api/outbound/contact-context?phone=${encodeURIComponent(phone)}`, {
      signal: controller.signal,
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body: {
        relationship?: unknown;
        permissionConfirmed?: boolean;
        nonsalesConfirmed?: boolean;
        customerSince?: string | null;
        suggestedPurpose?: OutboundPurposeChoice;
        salesAttestationRecorded?: boolean;
      } | null) => {
        if (!body || controller.signal.aborted) return;
        const hasRelationship = Boolean(body.relationship);
        setRelationship(hasRelationship);
        setPermissionStored(body.permissionConfirmed === true);
        setNonsalesStored(body.nonsalesConfirmed === true);
        setSalesAttestationRecorded(body.salesAttestationRecorded === true);
        if (!purposeTouched && body.suggestedPurpose) setPurpose(body.suggestedPurpose);
        if (body.customerSince) setCustomerSince(body.customerSince.slice(0, 10));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [open, number, preparedCall, purposeTouched]);

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

  // Keep the selected agent valid without disturbing typed fields: seed a
  // fallback when nothing is chosen yet, and drop a selection that no longer
  // exists in the roster so placeCall can't submit a stale id.
  useEffect(() => {
    if (!open || placing || uncertain || preparedCall || agents.length === 0) return;
    // A scoped history action or Studio proposal must never switch its Bot
    // silently while carrying over the proposed recipient and instructions.
    if (initialAgentId && !agents.some((agent) => agent.id === initialAgentId)) return;
    if (agentId && agents.some((agent) => agent.id === agentId)) return;
    const fallback =
      (initialAgentId && agents.some((agent) => agent.id === initialAgentId)
        ? initialAgentId
        : agents[0]?.id) || "";
    if (fallback && fallback !== agentId) setAgentId(fallback);
  }, [open, agentId, initialAgentId, agents, placing, uncertain, preparedCall]);

  const requestedAgentId = preparedCall?.agent_id || initialAgentId;
  const requestedAgent = agents.find((agent) => agent.id === requestedAgentId);
  const requestedAgentMissing = !!requestedAgentId && !loading && !requestedAgent;
  const resolvedAgentId = requestedAgentMissing
    ? ""
    : agentId && agents.some((agent) => agent.id === agentId)
      ? agentId
      : requestedAgent
        ? requestedAgent.id
        : agents[0]?.id || "";
  const selectedAgent = agents.find((agent) => agent.id === resolvedAgentId);
  const selectedReady = !!selectedAgent && isReviewedOutboundCandidate(selectedAgent);
  const setupHref = resolvedAgentId
    ? `/phone?tab=setup&agent=${encodeURIComponent(resolvedAgentId)}`
    : "/phone?tab=setup";
  const showPermission = !permissionStored;
  const showNonsales = !salesCall && callPurpose !== "callback" && !nonsalesStored;
  const showSalesAttestation = salesCall && !salesAttestationRecorded;
  const contentWarning = salesCall ? null : salesContentWarning(context);
  const canPlace =
    !placing &&
    !uncertain &&
    !recoveryError &&
    selectedReady &&
    (!preparedCall || Date.parse(preparedCall.expires_at) > Date.now()) &&
    !!resolvedAgentId &&
    number.trim().length > 0 &&
    (!showPermission || permissionChecked) &&
    (!showNonsales || nonsalesChecked) &&
    (!showSalesAttestation || salesAttestationChecked) &&
    (callPurpose !== "existing_customer" || customerSince.length > 0);

  const placeCall = async () => {
    if (!canPlace || placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    try {
      const digits = number.replace(/\D/g, "");
      const payload = {
        agentId: resolvedAgentId,
        customerNumber: `+${digits.length === 10 ? `1${digits}` : digits}`,
        customerName: "",
        context: context.trim() || undefined,
        callPurpose,
        permissionConfirmed: permissionChecked || permissionStored,
        nonsalesConfirmed: nonsalesChecked || nonsalesStored,
        customerSince: callPurpose === "existing_customer" ? customerSince : undefined,
        salesAttestationConfirmed: salesAttestationChecked,
      };
      const fingerprint = JSON.stringify(payload);
      if (requestRef.current?.fingerprint !== fingerprint) {
        requestRef.current = { fingerprint, key: preparedCall?.request_key ?? crypto.randomUUID() };
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
          ...(preparedCall ? { preparedRequestId: preparedCall.request_key } : {}),
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
        title: "Call requested",
        message: "The carrier accepted the call. Follow its progress in History.",
      });
      emitProductEvent({
        event: "outbound_call_started",
        agentId: resolvedAgentId,
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
            {preparedCall ? "Review call" : "New Call"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Enter a number and an optional instruction. Your Bot places the call.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex items-center gap-2 px-6 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading Bots…
            </div>
          ) : agents.length === 0 && (degraded || phoneLookupDegraded) ? (
            <p className="px-6 py-8 text-sm text-muted-foreground" role="status">
              {degraded
                ? "Your Bot list could not be loaded. Close this and try again in a moment."
                : "We could not check which numbers are attached. Close this and try again in a moment."}
            </p>
          ) : phoneLookupDegraded ? (
            <p className="px-6 py-8 text-sm text-muted-foreground" role="status">
              We could not check which numbers are attached. Close this and try again in a moment.
            </p>
          ) : requestedAgentMissing ? (
            <p className="px-6 py-8 text-sm text-muted-foreground" role="status">
              The selected Bot is unavailable. Check call history before another request.
            </p>
          ) : agents.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              Create a Bot before placing a call.{" "}
              <Link
                to="/studio?create=1"
                onClick={closeForNavigation}
                className="text-brand underline underline-offset-2"
              >
                Create a Bot
              </Link>
              .
            </p>
          ) : !selectedReady ? (
            <div className="space-y-4 px-6 py-5">
              {agents.length > 1 ? (
                <label className="block space-y-1.5">
                  <span className="block text-sm font-semibold text-foreground">Bot</span>
                  <select
                    className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                    value={resolvedAgentId}
                    disabled={placing || uncertain || !!preparedCall}
                    onChange={(event) => setAgentId(event.target.value)}
                  >
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <p className="text-sm text-foreground">
                Connect {selectedAgent?.name ? `${selectedAgent.name}'s` : "this Bot's"} number.
                Then you can call from here.
              </p>
            </div>
          ) : (
            <div className="space-y-4 px-6 py-5">
              <label className="block space-y-1.5">
                <span className="block text-sm font-semibold text-foreground">Phone number</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+1 (415) 555-0142"
                  className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                  value={number}
                  disabled={placing || uncertain || !!preparedCall}
                  onChange={(event) => setNumber(event.target.value)}
                />
              </label>
              <OutboundPurposePicker
                purpose={purpose === "sales" && relationship ? "returning_contact" : purpose}
                onPurpose={(next) => {
                  setPurposeTouched(true);
                  setPurpose(next);
                  setPermissionChecked(false);
                  setNonsalesChecked(false);
                }}
                relationship={relationship}
                customerSince={customerSince}
                onCustomerSince={setCustomerSince}
                showPermission={showPermission}
                permissionChecked={permissionChecked}
                onPermission={setPermissionChecked}
                showNonsales={showNonsales}
                nonsalesChecked={nonsalesChecked}
                onNonsales={setNonsalesChecked}
                contentWarning={contentWarning}
                disabled={placing || uncertain || !!preparedCall}
                permissionLabel={OUTBOUND_CONSENT_LABEL}
              />
              {showSalesAttestation ? (
                <SalesAttestationCheckbox
                  checked={salesAttestationChecked}
                  onChange={setSalesAttestationChecked}
                  disabled={placing || uncertain || !!preparedCall}
                />
              ) : null}
              <p className="text-xs leading-5 text-muted-foreground">
                <Link to={OUTBOUND_CONSENT_LEGAL_PATH} className="underline underline-offset-2">
                  Permission details
                </Link>
              </p>
              <label className="block space-y-1.5">
                <span className="block text-sm font-semibold text-foreground">
                  Instruction (optional)
                </span>
                <textarea
                  rows={3}
                  className="min-h-[88px] w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                  value={context}
                  disabled={placing || uncertain || !!preparedCall}
                  onChange={(event) => setContext(event.target.value)}
                  placeholder="What should the Bot accomplish on this call?"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-semibold text-foreground">Bot</span>
                <select
                  className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                  value={resolvedAgentId}
                  disabled={placing || uncertain || !!preparedCall}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
              {preparedCall && Date.parse(preparedCall.expires_at) <= Date.now() ? (
                <p role="alert" className="text-sm text-destructive">
                  This proposal expired. Prepare a new call from your connected app.
                </p>
              ) : null}
            </div>
          )}
          {uncertain || recoveryError ? (
            <div className="space-y-3 px-6 py-4">
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
            </div>
          ) : null}
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
          {!uncertain &&
          !loading &&
          !phoneLookupDegraded &&
          !requestedAgentMissing &&
          agents.length > 0 &&
          !selectedReady ? (
            <Button asChild>
              <Link to={setupHref} onClick={closeForNavigation}>
                Connect a number
              </Link>
            </Button>
          ) : (
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
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
