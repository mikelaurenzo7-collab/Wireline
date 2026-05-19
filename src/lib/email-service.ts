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
  provider: "resend" | "log-fallback";
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
