#!/usr/bin/env node

/**
 * Read-only launch probe. It validates credentials and funding posture without
 * printing secrets or making billable model/call requests.
 *
 * Load production env before running:
 *   node --env-file=.env.production scripts/check-vendor-readiness.mjs
 */

const checks = [];

function record(id, required, level, detail, fundingAction = null, metadata = undefined) {
  checks.push({
    id,
    required,
    level,
    detail,
    funding_action: fundingAction,
    ...(metadata ? { metadata } : {}),
  });
}

async function readJson(url, init = {}) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: {},
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

function present(name) {
  return Boolean(process.env[name]?.trim());
}

function validHttpsUrl(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return false;
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

record(
  "postgres",
  true,
  present("POSTGRES_URL") ? "ready" : "blocked",
  present("POSTGRES_URL")
    ? "Database URL configured; run npm run db:health."
    : "POSTGRES_URL missing.",
  present("POSTGRES_URL") ? "Maintain the Supabase plan; no prepaid balance is required." : null,
);

record(
  "upstash",
  true,
  present("UPSTASH_REDIS_REST_URL") && present("UPSTASH_REDIS_REST_TOKEN") ? "ready" : "blocked",
  "Distributed rate-limit credentials.",
  "Maintain a production Upstash database and billing method.",
);

const [
  xai,
  openai,
  gemini,
  vapi,
  twilioAccount,
  twilioBalance,
  stripeAccount,
  stripeBalance,
  resend,
  eleven,
] = await Promise.all([
  present("XAI_API_KEY")
    ? readJson("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      })
    : null,
  present("OPENAI_API_KEY")
    ? readJson("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      })
    : null,
  present("GEMINI_API_KEY")
    ? readJson(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      )
    : null,
  present("VAPI_PRIVATE_KEY")
    ? readJson("https://api.vapi.ai/phone-number?limit=1", {
        headers: { Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}` },
      })
    : null,
  present("TWILIO_ACCOUNT_SID") && present("TWILIO_AUTH_TOKEN")
    ? readJson(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}.json`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
            ).toString("base64")}`,
          },
        },
      )
    : null,
  present("TWILIO_ACCOUNT_SID") && present("TWILIO_AUTH_TOKEN")
    ? readJson(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/Balance.json`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
            ).toString("base64")}`,
          },
        },
      )
    : null,
  present("STRIPE_SECRET_KEY")
    ? readJson("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      })
    : null,
  present("STRIPE_SECRET_KEY")
    ? readJson("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      })
    : null,
  present("RESEND_API_KEY")
    ? readJson("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      })
    : null,
  present("ELEVENLABS_API_KEY")
    ? readJson("https://api.elevenlabs.io/v1/user/subscription", {
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
      })
    : null,
]);

record(
  "xai",
  true,
  xai?.ok ? "ready" : "blocked",
  xai?.ok
    ? "xAI key accepted; Grok structured/live-voice APIs are reachable."
    : "xAI key missing or rejected.",
  "Confirm prepaid credits or a nonzero invoiced billing limit in xAI Console.",
);
record(
  "openai",
  true,
  openai?.ok ? "ready" : "blocked",
  openai?.ok
    ? "OpenAI key accepted for Vapi PSTN intelligence/fallback."
    : "OpenAI key missing or rejected.",
  "Keep a payment method, project budget, and usage alerts enabled.",
);
record(
  "gemini",
  false,
  gemini?.ok ? "ready" : "degraded",
  gemini?.ok ? "Gemini fallback key accepted." : "Gemini fallback unavailable.",
  "Attach Google Cloud billing only if free/committed quota is insufficient.",
);
record(
  "ai_gateway",
  false,
  present("AI_GATEWAY_API_KEY") || present("VERCEL_OIDC_TOKEN") ? "ready" : "degraded",
  "Last-resort multi-model routing.",
  "Purchase Gateway credits and set an API-key budget/auto-top-up before scale.",
);
record(
  "vapi",
  true,
  vapi?.ok ? "ready" : "blocked",
  vapi?.ok
    ? "Vapi private key accepted; phone inventory reachable."
    : "Vapi key missing or rejected.",
  "Check Vapi Settings → Billing; add credits or enable auto-reload.",
);

const twilioReady = Boolean(twilioAccount?.ok && twilioAccount.body?.status === "active");
record(
  "twilio",
  true,
  twilioReady ? "ready" : "blocked",
  twilioReady
    ? `Twilio account active${twilioBalance?.ok ? `; reported balance ${twilioBalance.body.balance} ${twilioBalance.body.currency}` : ""}.`
    : `Twilio credentials missing or rejected${twilioAccount ? ` (HTTP ${twilioAccount.status})` : ""}.`,
  twilioReady
    ? "Keep the paid account and payment method current; configure Usage Triggers."
    : "Rotate TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN, upgrade the account, and add a payment method.",
);

const stripeAvailable = Number(
  stripeBalance?.body?.available?.find?.((row) => row.currency === "usd")?.amount ?? 0,
);
const stripeReady = Boolean(
  stripeAccount?.ok &&
  stripeAccount.body?.charges_enabled &&
  stripeAccount.body?.payouts_enabled &&
  stripeAvailable >= 0,
);
record(
  "stripe",
  true,
  stripeReady ? "ready" : "blocked",
  stripeAccount?.ok
    ? `Charges ${stripeAccount.body.charges_enabled ? "enabled" : "disabled"}; payouts ${
        stripeAccount.body.payouts_enabled ? "enabled" : "disabled"
      }; available USD balance ${(stripeAvailable / 100).toFixed(2)}.`
    : "Stripe key missing or rejected.",
  stripeAvailable < 0
    ? "Resolve the negative Stripe balance and failed bank debits before launch."
    : "No prepaid funding required; keep payout bank and webhook healthy.",
);

const verifiedDomains = resend?.ok
  ? (resend.body?.data ?? []).filter((domain) => domain.status === "verified")
  : [];
record(
  "resend",
  true,
  verifiedDomains.length > 0 ? "ready" : "blocked",
  verifiedDomains.length > 0
    ? `Verified sending domain(s): ${verifiedDomains.map((domain) => domain.name).join(", ")}.`
    : "Resend key/domain missing or unverified.",
  "Maintain the Resend plan; no prepaid balance is required.",
);

const elevenRemaining = eleven?.ok
  ? Number(eleven.body?.character_limit ?? 0) - Number(eleven.body?.character_count ?? 0)
  : null;
record(
  "elevenlabs",
  false,
  eleven?.ok ? "ready" : "degraded",
  eleven?.ok
    ? `${eleven.body.tier || "unknown"} plan active; ${Math.max(0, elevenRemaining).toLocaleString()} credits remaining.`
    : "Optional ElevenLabs voice layer unavailable.",
  elevenRemaining !== null && elevenRemaining > 0
    ? "No immediate top-up required; keep ElevenLabs optional for clones/showcase."
    : "Top up only if enabling voice cloning/showcase usage.",
);

record(
  "federal_dnc",
  true,
  validHttpsUrl("FEDERAL_DNC_API_URL") && present("FEDERAL_DNC_API_KEY") ? "ready" : "blocked",
  validHttpsUrl("FEDERAL_DNC_API_URL")
    ? "Federal DNC vendor URL and key configured."
    : "FEDERAL_DNC_API_URL is missing or is not a valid HTTPS URL.",
  "Maintain vendor subscription/scrub credits before enabling marketing outbound.",
);

const blocked = checks.filter((check) => check.required && check.level === "blocked");
const report = {
  generated_at: new Date().toISOString(),
  launch_ready: blocked.length === 0,
  blocked: blocked.map((check) => check.id),
  checks,
};

console.log(JSON.stringify(report, null, 2));
if (blocked.length > 0) process.exitCode = 1;
