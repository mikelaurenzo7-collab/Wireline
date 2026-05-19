/**
 * Transactional email helper — the single abstraction layer for
 * system-originated emails (password reset, account notifications,
 * security alerts). Route code MUST go through here instead of calling
 * Resend / SMTP / Mailgun directly so swapping providers later is a
 * one-file change.
 *
 * Transport selection:
 *   - If RESEND_API_KEY is set → POST to https://api.resend.com/emails.
 *   - Otherwise → log.warn the rendered link so dev/support can copy it
 *     out of runtime logs while production email transport is wired up.
 *     This is the documented stop-gap from the launch plan; the password
 *     reset flow stays usable in pre-launch tenants without a transport.
 *
 * NEVER log raw email bodies in production. The reset URL contains the
 * single-use token; treat it like a credential. The dev fallback emits
 * it intentionally so a single-tenant ops console can recover, but it
 * MUST NOT ship to a multi-tenant production with Resend unconfigured.
 */

import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

const DEFAULT_FROM = "Wireline <noreply@trywireline.com>";

interface SendResult {
  ok: boolean;
  provider: "resend" | "log-fallback" | "no-transport";
  id?: string;
  error?: string;
}

interface PasswordResetEmailOpts {
  to: string;
  resetUrl: string;
  expiresAt: Date;
}

async function sendViaResend(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, provider: "resend", error: "RESEND_API_KEY not set" };
  }
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        provider: "resend",
        error: `Resend ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const parsed = body ? JSON.parse(body) : {};
    return { ok: true, provider: "resend", id: parsed?.id };
  } catch (err) {
    return { ok: false, provider: "resend", error: getErrorMessage(err) };
  }
}

export async function sendPasswordResetEmail(opts: PasswordResetEmailOpts): Promise<SendResult> {
  const expiresHuman = `${Math.max(1, Math.round((opts.expiresAt.getTime() - Date.now()) / 60_000))} min`;

  const subject = "Reset your Wireline password";
  const text = [
    "Someone (hopefully you) requested a password reset for your Wireline account.",
    "",
    `Click the link below to set a new password. The link expires in ${expiresHuman}.`,
    "",
    opts.resetUrl,
    "",
    "If you did not request this, you can ignore this email — your password stays unchanged.",
    "",
    "— Wireline",
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1A1A23;">
      <h2 style="margin: 0 0 16px; font-weight: 600;">Reset your Wireline password</h2>
      <p style="margin: 0 0 16px; line-height: 1.55;">Someone (hopefully you) requested a password reset for your Wireline account.</p>
      <p style="margin: 0 0 24px; line-height: 1.55;">Click the button below to set a new password. The link expires in <strong>${expiresHuman}</strong>.</p>
      <p style="margin: 0 0 24px;"><a href="${opts.resetUrl}" style="display: inline-block; background: #4F1E7B; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reset password</a></p>
      <p style="margin: 0 0 16px; line-height: 1.55; color: #6B6B7A; font-size: 13px;">Or paste this link into your browser:<br><span style="word-break: break-all;">${opts.resetUrl}</span></p>
      <p style="margin: 32px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">If you did not request this, you can ignore this email — your password stays unchanged.</p>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({ to: opts.to, subject, html, text });
  }

  // Dev/no-transport fallback: log.warn so the URL is recoverable from
  // runtime logs. Only acceptable for single-tenant pre-launch ops.
  log.warn(
    "Password reset email transport not configured (RESEND_API_KEY missing). " +
      "Emitting URL to runtime log so support can deliver it manually.",
    {
      to: opts.to,
      resetUrl: opts.resetUrl,
      expiresAt: opts.expiresAt.toISOString(),
    },
  );
  return { ok: true, provider: "log-fallback" };
}

/**
 * Send a Wireline sign-up link via platform Resend. Used by the
 * `send_signup_link` Vapi tool that the 10 showcase demo agents call
 * when a caller asks for an email with the signup link.
 *
 * Distinct from sendEmail() in IntegrationService — that one routes
 * through the TENANT's connected Google/Microsoft OAuth account.
 * Showcase agents have no tenant; they use the platform Resend key.
 *
 *   to          recipient inbox (validated upstream as RFC-5322-shape)
 *   callerName  optional; if provided, used in the greeting
 *   agentName   the agent who's sending it (Sarah / Liam / Marcus / …)
 */
export async function sendSignupLinkEmail(opts: {
  to: string;
  callerName?: string;
  agentName?: string;
}): Promise<SendResult> {
  const signupUrl = `${(process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "")}/signup`;
  const greeting = opts.callerName ? `Hi ${opts.callerName.split(/\s+/)[0]},` : "Hi,";
  const fromAgent = opts.agentName ? ` — ${opts.agentName}` : "";

  const subject = "Your Wireline sign-up link";
  const text = [
    greeting,
    "",
    "Thanks for the call. Here's the link to start your 14-day Wireline trial — no credit card, dedicated phone number included, deploy your first AI agent in under 10 minutes:",
    "",
    signupUrl,
    "",
    "If you have any follow-up questions, just call back — same number you reached me on. Looking forward to hearing how the trial goes.",
    "",
    `— Wireline${fromAgent}`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
      <p style="margin: 0 0 16px; line-height: 1.55;">${greeting}</p>
      <p style="margin: 0 0 16px; line-height: 1.55;">Thanks for the call. Here's the link to start your <strong>14-day Wireline trial</strong> — no credit card, dedicated phone number included, deploy your first AI agent in under 10 minutes.</p>
      <p style="margin: 0 0 24px;"><a href="${signupUrl}" style="display: inline-block; background: #4F1E7B; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Start your trial</a></p>
      <p style="margin: 0 0 16px; line-height: 1.55; color: #6B6B7A; font-size: 13px;">Or paste this link into your browser:<br><span style="word-break: break-all;">${signupUrl}</span></p>
      <p style="margin: 24px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">If you have any follow-up questions, just call back — same number you reached me on.</p>
      <p style="margin: 24px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">— Wireline${fromAgent}</p>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({ to: opts.to, subject, html, text });
  }

  // The showcase Vapi agents use this path on every demo call where
  // a caller asks for a signup link. Unlike sendPasswordResetEmail
  // (which has a legit dev/single-tenant log-fallback) — we MUST NOT
  // return ok:true here when no transport is configured, because the
  // agent treats ok:true as "tell the caller it was sent" and the
  // caller waits for an email that never arrives. That's exactly the
  // fabrication failure mode the agent moat is supposed to prevent.
  //
  // Fail loud in prod so the agent reads back the URL by mouth and
  // ends the call honestly:
  log.warn(
    "send_signup_link called but RESEND_API_KEY is not set — failing loud so the agent doesn't lie about delivery.",
    {
      to: opts.to,
      signupUrl,
      agentName: opts.agentName,
    },
  );
  return {
    ok: false,
    provider: "no-transport",
    error: "Email transport not configured (RESEND_API_KEY missing)",
  };
}
