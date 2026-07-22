import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, ReceiptText, Wallet } from "lucide-react";
import { authFetch } from "../lib/api";
import { emitProductEvent } from "../lib/product-event-client";

type LedgerEntry = {
  id: string;
  deltaUsd: number;
  balanceAfterUsd: number;
  reason: string;
  createdAt: string | null;
};

type BalanceResponse = {
  balance_usd: number;
  presets_usd: number[];
  min_usd: number;
  copy: { title: string; subtitle: string; reassurance: string };
  ledger: LedgerEntry[];
  stripe_configured: boolean;
};

function formatReason(reason: string) {
  return reason.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export default function ConversationBalanceCard() {
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAmount, setBusyAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/conversation-balance");
      const body = (await response.json().catch(() => null)) as
        | BalanceResponse
        | { error?: string }
        | null;
      if (!response.ok)
        throw new Error(
          (body as { error?: string } | null)?.error || "Could not load Conversation Balance.",
        );
      setBalance(body as BalanceResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Conversation Balance.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("balance") !== "success") return;
    const timeout = window.setTimeout(() => void load(), 1200);
    window.history.replaceState({}, "", window.location.pathname);
    return () => window.clearTimeout(timeout);
  }, []);

  const addBalance = async (amountUsd: number) => {
    setBusyAmount(amountUsd);
    setError(null);
    try {
      emitProductEvent({
        event: "conversation_balance_checkout_started",
        metadata: { amount_usd: amountUsd, source: "conversation_balance_card" },
      });
      const response = await authFetch("/api/conversation-balance/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_usd: amountUsd }),
      });
      const body = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!response.ok || !body?.url) throw new Error(body?.error || "Could not start checkout.");
      window.location.href = body.url;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start checkout.");
      setBusyAmount(null);
    }
  };

  if (loading) {
    return (
      <section className="wl-paper wl-paper-elevated flex items-center gap-3 p-5" aria-busy="true">
        <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-muted text-primary">
          <Loader2 className="size-4 animate-spin" />
        </span>
        <p className="text-sm text-muted-foreground">Loading Conversation Balance...</p>
      </section>
    );
  }

  const presets = balance?.presets_usd?.length ? balance.presets_usd : [5, 10, 25, 50];
  const copy = balance?.copy ?? {
    title: "Conversation Balance",
    subtitle: "Start free. Add balance when you are ready to run calls, texts, and follow-up.",
    reassurance: "No automatic reload. Add more only when you want more live work.",
  };
  const balanceUsd = balance?.balance_usd ?? 0;

  return (
    <section className="wl-paper wl-paper-elevated overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-border p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-primary">
            <Wallet className="size-4" />
            <p className="text-xs font-semibold tracking-[-0.01em] text-foreground">Balance</p>
          </div>
          <h2 className="wl-section-title mt-2 text-[clamp(1.4rem,1.2rem+1vw,1.85rem)]">
            {copy.title}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="shrink-0 rounded-[var(--radius-lg)] border border-border bg-secondary px-4 py-3 text-right">
          <p className="wl-overline text-[var(--wireline-typography-overline-size)]">
            Available now
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-[-.04em] tabular-nums text-foreground">
            ${balanceUsd.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2.5">
          {presets.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => void addBalance(amount)}
              disabled={busyAmount !== null || !balance?.stripe_configured}
              className="studio-secondary-button min-h-10 px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyAmount === amount ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add ${amount}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
          {copy.reassurance}
        </p>

        {error ? (
          <div
            className="mt-4 flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm text-foreground"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p>{error}</p>
          </div>
        ) : null}

        {!balance?.stripe_configured ? (
          <div className="mt-4 rounded-[var(--radius-lg)] border border-[color:color-mix(in_srgb,var(--wireline-color-status-warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--wireline-color-status-warning)_8%,var(--card))] px-3 py-3 text-sm text-foreground">
            Payments are still being connected for this environment. Your balance history will
            appear here once checkout is live.
          </div>
        ) : null}

        {balance?.ledger?.length ? (
          <div className="mt-6 border-t border-border pt-5">
            <div className="mb-3 flex items-center gap-2">
              <ReceiptText className="size-4 text-primary" />
              <h3 className="wl-card-title">Recent balance activity</h3>
            </div>
            <ul className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-card">
              {balance.ledger.slice(0, 5).map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-4 px-3.5 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {formatReason(entry.reason)}
                    </p>
                    {entry.createdAt ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(entry.createdAt)}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={
                        entry.deltaUsd >= 0
                          ? "font-semibold text-primary"
                          : "font-semibold text-foreground"
                      }
                    >
                      {entry.deltaUsd >= 0 ? "+" : ""}${entry.deltaUsd.toFixed(2)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      ${entry.balanceAfterUsd.toFixed(2)} left
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
