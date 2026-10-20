import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Loader2, Phone } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button, Input } from "./atoms";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./atoms/Dialog";
import { Checkbox } from "./ui/shadcn/Checkbox";
import { StatusNotice } from "./molecules";
import {
  checkPhoneTest,
  endPhoneTest,
  normalizePhoneTestNumber,
  PhoneTestRequestError,
  requestPhoneTest,
} from "../lib/phone-test-client";
import { phoneTestIsTerminal, type PhoneTestReceipt } from "../lib/phone-test-contract";
import { connectedCallPresence } from "../lib/voice-presence";

type Props = {
  open: boolean;
  onClose: () => void;
  agentId: string;
  agentName: string;
  agents?: Array<{ id: string; name: string }>;
  onAgentChange?: (id: string) => void;
};
const STATUS_LABELS = {
  creating: "Preparing your call",
  ringing: "Calling your phone",
  verifying: "Enter the code on your phone",
  connected: "Connected",
  ending: "Ending your call",
  completed: "Call completed",
  failed: "Call could not finish",
  uncertain: "Checking call status",
  cancelled: "Call ended",
} as const;

function savedRequest(storageKey: string): string | null {
  try {
    const value = sessionStorage.getItem(storageKey);
    return value && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

function saveRequest(storageKey: string, value: string | null) {
  try {
    if (value) sessionStorage.setItem(storageKey, value);
    else sessionStorage.removeItem(storageKey);
  } catch {
    // The server still prevents simultaneous/duplicate calls when storage is unavailable.
  }
}

export default function PhoneTestDialog(props: Props) {
  const { user } = useAuth();
  return user ? (
    <OwnedPhoneTestDialog key={`${user.id}:${props.agentId}`} {...props} userId={user.id} />
  ) : null;
}

function OwnedPhoneTestDialog({
  open,
  onClose,
  agentId,
  agentName,
  agents,
  onAgentChange,
  userId,
}: Props & { userId: string }) {
  const storageKey = `botbound:phone-test:${userId}:${agentId}`;
  const [requestKey, setRequestKey] = useState(() => savedRequest(storageKey));
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [receipt, setReceipt] = useState<PhoneTestReceipt | null>(null);
  const [busy, setBusy] = useState<"starting" | "checking" | "ending" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const opener = useRef<HTMLElement | null>(null);
  const terminal = Boolean(receipt && phoneTestIsTerminal(receipt.status));
  const pending = Boolean(requestKey && !terminal);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function accept(result: PhoneTestReceipt) {
    if (!alive.current) return;
    setReceipt(result);
    setError(null);
  }

  useEffect(() => {
    if (!open || !requestKey || terminal) return;
    let disposed = false;
    async function refresh() {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const result = await checkPhoneTest(agentId, requestKey!);
        if (!disposed && alive.current) accept(result);
      } catch (reason) {
        if (!disposed && alive.current)
          setError(
            reason instanceof Error ? reason.message : "Could not check the call. Try again.",
          );
      } finally {
        busyRef.current = false;
      }
    }
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 4_000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [open, requestKey, agentId, terminal]);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current || requestKey || !consent) return;
    const normalized = normalizePhoneTestNumber(phone);
    if (!normalized) {
      setError("Enter a valid US phone number.");
      return;
    }
    const key = crypto.randomUUID();
    busyRef.current = true;
    setBusy("starting");
    setError(null);
    saveRequest(storageKey, key);
    setRequestKey(key);
    try {
      accept(
        await requestPhoneTest(agentId, { request_key: key, phone: normalized, consent: true }),
      );
    } catch (reason) {
      if (!alive.current) return;
      setError(reason instanceof Error ? reason.message : "The call could not be confirmed.");
      // Only a definite first-attempt rejection proves that no call was accepted.
      if (reason instanceof PhoneTestRequestError && !reason.uncertain) {
        saveRequest(storageKey, null);
        setRequestKey(null);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(null);
    }
  }

  async function act(ending: boolean) {
    if (!requestKey || busyRef.current) return;
    busyRef.current = true;
    setBusy(ending ? "ending" : "checking");
    setError(null);
    try {
      accept(await (ending ? endPhoneTest : checkPhoneTest)(agentId, requestKey));
    } catch (reason) {
      if (alive.current)
        setError(reason instanceof Error ? reason.message : "Could not confirm the call status.");
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(null);
    }
  }

  function newTest() {
    if (busyRef.current || !receipt || !phoneTestIsTerminal(receipt.status)) return;
    saveRequest(storageKey, null);
    setRequestKey(null);
    setReceipt(null);
    setConsent(false);
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-w-md p-4 sm:p-6 [&>button]:h-[44px] [&>button]:w-[44px]"
        showClose={!busy}
        aria-busy={Boolean(busy)}
        onOpenAutoFocus={() => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader className="pr-[44px]">
          <DialogTitle className="pr-0">Phone Test</DialogTitle>
          <DialogDescription className={requestKey ? "sr-only" : undefined}>
            {pending
              ? "Your call continues if you close this window."
              : requestKey
                ? "Your phone test has ended."
                : `Receive a real call from ${agentName}.`}
          </DialogDescription>
        </DialogHeader>
        {!requestKey ? (
          <form
            onSubmit={(event) => {
              void start(event);
            }}
            className="min-w-0 space-y-4"
          >
            {agents && agents.length > 1 && onAgentChange ? (
              <label className="block min-w-0 space-y-2 text-sm font-medium">
                <span>Bot</span>
                <select
                  value={agentId}
                  onChange={(event) => onAgentChange(event.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  disabled={Boolean(busy)}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block min-w-0 space-y-2 text-sm font-medium">
              <span>Your phone number</span>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                disabled={Boolean(busy)}
                maxLength={30}
                placeholder="US phone number"
              />
            </label>
            <label className="flex min-w-0 items-start gap-3 text-sm leading-relaxed">
              <Checkbox
                className="mt-0.5 shrink-0"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                disabled={Boolean(busy)}
              />
              <span>I’m requesting an AI test call to my own phone.</span>
            </label>
            <p className="text-sm text-muted-foreground">
              Up to 2 minutes, including verification. Uses your call allowance.
            </p>
            {error ? (
              <StatusNotice tone="destructive" icon={false} title="Call not placed">
                {error}
              </StatusNotice>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={Boolean(busy) || !consent || !phone.trim()}>
                <Phone aria-hidden="true" /> Call my phone
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="min-w-0 space-y-4">
            <div role="status" aria-live="polite" className="space-y-2">
              <p className="font-semibold">
                {receipt ? STATUS_LABELS[receipt.status] : "Checking your call"}
              </p>
              {receipt?.phone_last4 ? (
                <p className="text-sm text-muted-foreground">Ending in {receipt.phone_last4}</p>
              ) : null}
              {receipt?.status === "connected" ? (
                <p className="text-sm text-muted-foreground">{connectedCallPresence()}</p>
              ) : null}
            </div>
            {receipt?.verification_code ? (
              <div className="min-w-0 rounded-xl border border-border bg-secondary/40 p-3 text-center">
                <p className="text-sm">When asked, enter</p>
                <output
                  aria-label="Phone verification code"
                  className="my-3 block font-mono text-[clamp(1rem,7vw,1.875rem)] font-semibold tracking-[0.08em] tabular-nums"
                >
                  {receipt.verification_code}
                </output>
              </div>
            ) : null}
            {receipt?.error || error ? (
              <StatusNotice tone="warning" icon={false} title="Call update">
                {receipt?.error || error}
              </StatusNotice>
            ) : null}
            {receipt?.status === "completed" ? (
              <p className="text-sm text-muted-foreground">
                Your call and its outcome will appear in Calls.
              </p>
            ) : null}
            <DialogFooter className="flex-wrap">
              {pending ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      void act(false);
                    }}
                  >
                    {busy === "checking" ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : null}
                    Check call
                  </Button>
                  {receipt?.status === "uncertain" ? (
                    <Button
                      variant="secondary"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        saveRequest(storageKey, null);
                        setRequestKey(null);
                        setReceipt(null);
                        setConsent(false);
                        setError(null);
                      }}
                    >
                      Start over
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    disabled={Boolean(busy) || receipt?.status === "ending"}
                    onClick={() => {
                      void act(true);
                    }}
                  >
                    {busy === "ending" ? "Ending…" : "End call"}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={newTest}>
                    New test
                  </Button>
                  <Button asChild>
                    <Link to="/phone" onClick={onClose}>
                      View calls
                    </Link>
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
