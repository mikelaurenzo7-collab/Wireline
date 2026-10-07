import { useEffect, useMemo, useRef, useState } from "react";
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

type OutboundDialDialogProps = {
  open: boolean;
  onClose: () => void;
  initialAgentId?: string;
  initialNumber?: string;
  initialContext?: string;
};

export default function OutboundDialDialog({
  open,
  onClose,
  initialAgentId = "",
  initialNumber = "",
  initialContext = "",
}: OutboundDialDialogProps) {
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
    if (!open) return;
    setAgentId(initialAgentId);
    setNumber(initialNumber);
    setContext(initialContext);
    setCallPurpose("service_or_requested");
    setConsentConfirmed(false);
  }, [open, initialAgentId, initialNumber, initialContext]);

  // Keep the selected agent valid without disturbing typed fields: seed a
  // fallback when nothing is chosen yet, and drop a selection that no longer
  // exists in the roster (agent deleted or lost its phone line on a background
  // refresh) so placeCall can't submit a stale id the <select> no longer shows.
  useEffect(() => {
    if (!open || voiceAgents.length === 0) return;
    if (agentId && voiceAgents.some((agent) => agent.id === agentId)) return;
    const fallback =
      (initialAgentId && voiceAgents.some((agent) => agent.id === initialAgentId)
        ? initialAgentId
        : voiceAgents[0]?.id) || "";
    if (fallback && fallback !== agentId) setAgentId(fallback);
  }, [open, agentId, initialAgentId, voiceAgents]);

  const canPlace =
    DIRECT_OUTBOUND_AVAILABILITY.available &&
    !placing &&
    !!agentId &&
    number.trim().length > 0 &&
    (callPurpose !== "marketing_or_sales" || consentConfirmed) &&
    voiceAgents.length > 0;

  const placeCall = async () => {
    if (!canPlace) return;
    setPlacing(true);
    try {
      const response = await authFetch("/api/outbound/dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          customerNumber: number.trim(),
          customerName: "",
          context: context.trim() || undefined,
          callPurpose,
          hasExpressWrittenConsent: callPurpose === "marketing_or_sales" && consentConfirmed,
          ...(callPurpose === "marketing_or_sales" && consentConfirmed
            ? { consentSource: "manual_attestation" as const }
            : {}),
        }),
      });
      const body = (await response.json()) as { error?: string; code?: string };
      if (!response.ok) {
        toast({
          type: "error",
          title: "Call Not Placed",
          message: body.error || "Outbound dial was blocked.",
          duration: 10_000,
        });
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
      toast({
        type: "error",
        title: "Call Not Placed",
        message: "Something went wrong. Try again in a moment.",
      });
    } finally {
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
            {DIRECT_OUTBOUND_AVAILABILITY.available
              ? "Pick a Bot with a phone number, enter the number to call, and classify the call before dialing."
              : "Outbound calling is not available yet."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {!DIRECT_OUTBOUND_AVAILABILITY.available ? (
            <div className="space-y-4 px-6 py-5">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {DIRECT_OUTBOUND_AVAILABILITY.message}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link
                    to={`/studio?workroom=test${initialAgentId ? `&agent=${encodeURIComponent(initialAgentId)}` : ""}`}
                    onClick={closeForNavigation}
                  >
                    Test in Studio
                  </Link>
                </Button>
                <Button variant="secondary" asChild>
                  <Link to="/settings/compliance" onClick={closeForNavigation}>
                    Review compliance
                  </Link>
                </Button>
              </div>
            </div>
          ) : loading ? (
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
                  onChange={(event) => setContext(event.target.value)}
                  placeholder="What should the Bot accomplish on this call?"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-semibold text-foreground">Call type</span>
                <select
                  className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                  value={callPurpose}
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

              {callPurpose === "marketing_or_sales" ? (
                <label className="flex items-start gap-3 rounded-md border border-input/80 bg-muted/30 p-3">
                  <Checkbox
                    className="mt-1"
                    checked={consentConfirmed}
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
            {DIRECT_OUTBOUND_AVAILABILITY.available ? "Cancel" : "Close"}
          </Button>
          {DIRECT_OUTBOUND_AVAILABILITY.available ? (
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
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
