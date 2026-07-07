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
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAgentId(initialAgentId || voiceAgents[0]?.id || "");
    setNumber(initialNumber);
    setContext(initialContext);
    setConsentConfirmed(false);
  }, [open, initialAgentId, initialNumber, initialContext, voiceAgents]);

  const canPlace =
    !placing && !!agentId && number.trim().length > 0 && consentConfirmed && voiceAgents.length > 0;

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
          hasExpressWrittenConsent: true,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" aria-hidden />
            New outbound call
          </DialogTitle>
          <DialogDescription>
            Pick an agent with a live line, enter a number, and confirm consent before dialing.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading agents…
          </div>
        ) : voiceAgents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No voice agents with a phone line yet.{" "}
            <Link to="/studio?create=1" className="text-brand underline-offset-2 hover:underline">
              Create and activate one in Studio
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-foreground">Agent</span>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              <span className="text-xs font-medium text-foreground">Phone number</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+15551234567"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-foreground">Instruction (optional)</span>
              <textarea
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="What should the agent accomplish on this call?"
              />
            </label>

            <label className="flex items-start gap-3 rounded-md border border-input/80 bg-muted/30 p-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={consentConfirmed}
                onChange={(event) => setConsentConfirmed(event.target.checked)}
              />
              <span className="space-y-1 text-sm">
                <span className="block text-foreground">{OUTBOUND_CONSENT_LABEL}</span>
                <span className="block text-muted-foreground text-xs">{OUTBOUND_CONSENT_HELP}</span>
                <Link
                  to={OUTBOUND_CONSENT_LEGAL_PATH}
                  className="text-xs text-brand underline-offset-2 hover:underline"
                >
                  {OUTBOUND_CONSENT_LEARN_MORE}
                </Link>
              </span>
            </label>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
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
