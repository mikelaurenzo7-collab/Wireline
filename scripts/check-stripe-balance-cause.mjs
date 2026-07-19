#!/usr/bin/env node

/**
 * Read-only Stripe balance ledger diagnostic.
 * Lists sanitized negative balance transactions without printing secrets or
 * customer/card details. No Stripe objects are created or mutated.
 */

const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is not configured.");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${secretKey}` };

async function readJson(path) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Stripe read failed (${response.status}): ${body?.error?.type || "unknown"}`);
  }
  return body;
}

function usd(value, currency) {
  if (String(currency || "").toLowerCase() !== "usd") return null;
  return Math.round(Number(value || 0)) / 100;
}

function sanitizedDescription(value) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .replace(/\b(?:\d[ -]*?){12,19}\b/g, "[number]")
    .slice(0, 180);
}

function sourceKind(source) {
  if (typeof source !== "string" || !source) return null;
  const match = source.match(/^([a-z]+)_/i);
  return match?.[1]?.toLowerCase() || "object";
}

async function listBalanceTransactions() {
  const all = [];
  let startingAfter = "";
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (startingAfter) query.set("starting_after", startingAfter);
    const body = await readJson(`/v1/balance_transactions?${query.toString()}`);
    const rows = Array.isArray(body.data) ? body.data : [];
    all.push(...rows);
    if (!body.has_more || rows.length === 0) break;
    startingAfter = rows.at(-1)?.id || "";
    if (!startingAfter) break;
  }
  return all;
}

try {
  const [balance, transactions] = await Promise.all([
    readJson("/v1/balance"),
    listBalanceTransactions(),
  ]);
  const negatives = transactions.filter(
    (row) => Number(row.net || 0) < 0 || Number(row.amount || 0) < 0,
  );
  const totals = new Map();
  for (const row of negatives) {
    const key = String(row.reporting_category || row.type || "unknown");
    totals.set(key, (totals.get(key) || 0) + Number(row.net || 0));
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: secretKey.startsWith("sk_live_") ? "live" : "test",
    balance: {
      available: (balance.available || []).map((row) => ({
        currency: row.currency,
        amount_usd: usd(row.amount, row.currency),
      })),
      pending: (balance.pending || []).map((row) => ({
        currency: row.currency,
        amount_usd: usd(row.amount, row.currency),
      })),
    },
    inspected_transaction_count: transactions.length,
    negative_transaction_count: negatives.length,
    negative_totals_by_category_usd: Object.fromEntries(
      [...totals.entries()].map(([key, value]) => [key, Math.round(value) / 100]),
    ),
    recent_negative_transactions: negatives.slice(0, 50).map((row) => ({
      id: row.id,
      created_at: new Date(Number(row.created || 0) * 1000).toISOString(),
      available_at: new Date(Number(row.available_on || row.created || 0) * 1000).toISOString(),
      type: row.type || null,
      reporting_category: row.reporting_category || null,
      source_kind: sourceKind(row.source),
      gross_usd: usd(row.amount, row.currency),
      fee_usd: usd(row.fee, row.currency),
      net_usd: usd(row.net, row.currency),
      status: row.status || null,
      description: sanitizedDescription(row.description),
    })),
  };

  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Stripe balance audit failed.");
  process.exit(1);
}
