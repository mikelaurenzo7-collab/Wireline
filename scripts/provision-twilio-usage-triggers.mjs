#!/usr/bin/env node

import "dotenv/config";

const USAGE_ALERT_PATH = "/api/twilio-webhook/usage-alert";
const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply") || args.has("--dry-run");
const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
const appUrl = (process.env.APP_URL?.trim() || "https://trywireline.com").replace(/\/+$/, "");
const callbackUrl = `${appUrl}${USAGE_ALERT_PATH}`;

function parseUsd(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function twilioAuthorization() {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function triggerValueKey(value) {
  return Number(value).toString();
}

function sanitizedTrigger(trigger) {
  return {
    sid: trigger.sid ?? null,
    friendly_name: trigger.friendly_name ?? null,
    recurring: trigger.recurring ?? null,
    usage_category: trigger.usage_category ?? null,
    trigger_by: trigger.trigger_by ?? null,
    trigger_value: trigger.trigger_value ?? null,
    callback_url: trigger.callback_url ?? null,
    callback_method: trigger.callback_method ?? null,
  };
}

async function twilioJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: twilioAuthorization(),
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      Accept: "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Twilio ${init.method || "GET"} ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function listUsageTriggers() {
  const url = `${TWILIO_API_BASE}/Accounts/${encodeURIComponent(
    accountSid,
  )}/Usage/Triggers.json?PageSize=100`;
  const body = await twilioJson(url);
  return Array.isArray(body.usage_triggers) ? body.usage_triggers : [];
}

function desiredTriggers() {
  const dailyValue = parseUsd("TWILIO_DAILY_USAGE_TRIGGER_USD", 25);
  const monthlyValue = parseUsd("TWILIO_MONTHLY_USAGE_TRIGGER_USD", 200);
  return [
    {
      FriendlyName: `wireline-daily-totalprice-${triggerValueKey(dailyValue)}`,
      Recurring: "daily",
      UsageCategory: "totalprice",
      TriggerBy: "price",
      TriggerValue: triggerValueKey(dailyValue),
      CallbackUrl: callbackUrl,
      CallbackMethod: "POST",
    },
    {
      FriendlyName: `wireline-monthly-totalprice-${triggerValueKey(monthlyValue)}`,
      Recurring: "monthly",
      UsageCategory: "totalprice",
      TriggerBy: "price",
      TriggerValue: triggerValueKey(monthlyValue),
      CallbackUrl: callbackUrl,
      CallbackMethod: "POST",
    },
  ];
}

function matchingTrigger(existing, desired) {
  return existing.find((trigger) => {
    const triggerValue = triggerValueKey(trigger.trigger_value);
    return (
      trigger.recurring === desired.Recurring &&
      trigger.usage_category === desired.UsageCategory &&
      triggerValue === desired.TriggerValue &&
      String(trigger.callback_url || "").endsWith(USAGE_ALERT_PATH)
    );
  });
}

async function createUsageTrigger(desired) {
  const url = `${TWILIO_API_BASE}/Accounts/${encodeURIComponent(accountSid)}/Usage/Triggers.json`;
  const body = new URLSearchParams(desired);
  return twilioJson(url, { method: "POST", body });
}

async function main() {
  const summary = {
    dry_run: dryRun,
    callback_url: callbackUrl,
    existing: [],
    created: [],
    skipped: [],
    errors: [],
  };

  try {
    if (!accountSid || !authToken) {
      throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required.");
    }

    const existing = await listUsageTriggers();
    summary.existing = existing.map(sanitizedTrigger);

    for (const desired of desiredTriggers()) {
      const existingMatch = matchingTrigger(existing, desired);
      if (existingMatch) {
        summary.skipped.push({
          reason: "already_exists",
          desired,
          existing: sanitizedTrigger(existingMatch),
        });
        continue;
      }

      if (dryRun) {
        summary.skipped.push({ reason: "dry_run", desired });
        continue;
      }

      const created = await createUsageTrigger(desired);
      summary.created.push(sanitizedTrigger(created));
    }
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length > 0) process.exitCode = 1;
}

await main();
