import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { useToast } from "../contexts/ToastContext";
import { authFetch } from "../lib/api";
import {
  OUTBOUND_CONSENT_HELP,
  OUTBOUND_CONSENT_LABEL,
  OUTBOUND_CONSENT_LEARN_MORE,
  OUTBOUND_CONSENT_LEGAL_PATH,
} from "../lib/outbound-consent-copy";
import type { OutboundCallPurpose } from "../lib/outbound-call-purpose";
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
  const { agents, loading } = useAgents();
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

  useEffect(() => {
    if (!open) return;
    setAgentId(initialAgentId || voiceAgents[0]?.id || "");
    setNumber(initialNumber);
    setContext(initialContext);
    setCallPurpose("service_or_requested");
    setConsentConfirmed(false);
  }, [open, initialAgentId, initialNumber, initialContext, voiceAgents]);

  const canPlace =
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
        }),
      });
      const body = (await response.json()) as { error?: string; code?: string };
      if (!response.ok) {
        toast({
          type: "error",
          title: "Call not placed",
          message: body.error || "Outbound dial was blocked.",
          duration: 10_000,
        });
        return;
      }
      toast({
        type: "success",
        title: "Call started",
        message: "Your agent is dialing now.",
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
        title: "Call not placed",
        message: "Something went wrong. Try again in a moment.",
      });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md border-border bg-[var(--wireline-color-surface-default)] p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-2 font-[var(--wireline-font-family-display)] text-xl font-normal tracking-[-0.02em]">
            <Phone className="h-4 w-4 text-primary" aria-hidden />
            New outbound call
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Pick an agent with a live line, enter a number, and classify the call before dialing.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading agents…
          </div>
        ) : voiceAgents.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground">
            No voice agents with a phone line yet.{" "}
            <Link to="/studio?create=1" className="text-brand underline-offset-2 hover:underline">
              Create and activate one in Studio
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4 px-6 py-5">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Agent</span>
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
              <span className="text-xs font-semibold text-foreground">Phone number</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+15551234567"
                className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Instruction (optional)</span>
              <textarea
                rows={3}
                className="min-h-[88px] w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="What should the agent accomplish on this call?"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Call type</span>
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
                <input
                  type="checkbox"
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
                    className="text-xs text-brand underline-offset-2 hover:underline"
                  >
                    {OUTBOUND_CONSENT_LEARN_MORE}
                  </Link>
                </span>
              </label>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 border-t border-border bg-[var(--wireline-color-surface-default)] px-6 py-4 sm:gap-0">
          <Button type="button" variant="secondary" onClick={onClose} disabled={placing}>
            Cancel
          </Button>
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
