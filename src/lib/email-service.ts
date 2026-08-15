/**
 * Transactional email helper — the single abstraction layer for
 * system-originated emails (password reset, account notifications,
 * security alerts). Route code MUST go through here instead of calling
 * Resend / SMTP / Mailgun directly so swapping providers later is a
 * one-file change.
 *
 * Transport selection:
 *   - If RESEND_API_KEY is set → POST to https://api.resend.com/emails.
 *   - Otherwise → fail closed and report delivery as unavailable.
 *
 * NEVER log raw email bodies or reset URLs. A reset URL is a bearer
 * credential; anyone who can read it can take over the account.
 */

import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import {
  isEmailSuppressed,
  buildListUnsubscribeHeaders,
  buildComplianceFooterText,
  buildComplianceFooterHtml,
  getPostalAddress,
} from "./email-compliance";
import { isProviderDeliverySuppressed } from "./email-delivery-suppression";
import { BRAND } from "../constants/brand-colors";
import {
  formatResendApiError,
  getResendTransportDiagnostics,
  resolveResendFromAddress,
} from "./resend-config";

export interface SendResult {
  ok: boolean;
  provider: "resend" | "log-fallback" | "no-transport";
  id?: string;
  error?: string;
}

/**
 * Keep recipient diagnostics useful without putting full addresses in logs.
 * Domains help diagnose provider/configuration failures; local parts stay private.
 */
function emailLogContext(email: string): {
  recipientRedacted: true;
  recipientDomain?: string;
} {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  const recipientDomain =
    at >= 0 && at < normalized.length - 1 ? normalized.slice(at + 1) : undefined;
  return {
    recipientRedacted: true,
    ...(recipientDomain ? { recipientDomain } : {}),
  };
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
  /** Extra SMTP headers (e.g. RFC 8058 List-Unsubscribe) for bulk/marketing mail. */
  headers?: Record<string, string>;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, provider: "resend", error: "RESEND_API_KEY not set" };
  }

  // Provider complaints, hard bounces, and Resend-level suppressions apply to
  // every platform Resend attempt, including transactional mail. This is kept
  // separate from the CAN-SPAM preference table so a marketing unsubscribe
  // does not suppress password reset, verification, or billing notices.
  try {
    if (await isProviderDeliverySuppressed(args.to)) {
      log.warn("[email-service] Resend send blocked by provider delivery suppression", {
        ...emailLogContext(args.to),
      });
      return {
        ok: false,
        provider: "resend",
        error: "Recipient is suppressed after provider delivery feedback.",
      };
    }
  } catch (err) {
    log.error("[email-service] Provider delivery suppression check failed", {
      ...emailLogContext(args.to),
      error: getErrorMessage(err),
    });
    return {
      ok: false,
      provider: "resend",
      error: "Email delivery safety check unavailable",
    };
  }

  const from = resolveResendFromAddress();
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
        ...(args.headers && Object.keys(args.headers).length ? { headers: args.headers } : {}),
      }),
      // Cap the send so a hung Resend request can't stall auth/billing critical
      // paths (password reset, security alerts) indefinitely.
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text();
    if (!res.ok) {
      const error = formatResendApiError(res.status, body);
      log.error("[email-service] Resend rejected send", {
        status: res.status,
        ...emailLogContext(args.to),
        from,
        error,
        transport: getResendTransportDiagnostics(),
      });
      return {
        ok: false,
        provider: "resend",
        error,
      };
    }
    const parsed = body ? JSON.parse(body) : {};
    log.info("[email-service] Resend accepted send", {
      ...emailLogContext(args.to),
      from,
      resendId: parsed?.id,
    });
    return { ok: true, provider: "resend", id: parsed?.id };
  } catch (err) {
    const error = getErrorMessage(err);
    log.error("[email-service] Resend transport error", {
      ...emailLogContext(args.to),
      from,
      error,
      transport: getResendTransportDiagnostics(),
    });
    return { ok: false, provider: "resend", error };
  }
}

/**
 * Generic transactional email send. Used by ad-hoc senders (e.g. the
 * phone agent's send_payment_link tool) that don't have a dedicated
 * templated helper. Returns ok:false if no transport is configured —
 * callers must not claim delivery on a false result.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra SMTP headers (e.g. RFC 8058 List-Unsubscribe) for bulk/marketing mail. */
  headers?: Record<string, string>;
}): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, provider: "no-transport", error: "RESEND_API_KEY not set" };
  }
  return await sendViaResend(opts);
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
      <p style="margin: 0 0 24px;"><a href="${escapeHtml(opts.resetUrl)}" style="display: inline-block; background: ${BRAND.colors.primary}; color: ${BRAND.colors.onPrimary}; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reset password</a></p>
      <p style="margin: 0 0 16px; line-height: 1.55; color: #6B6B7A; font-size: 13px;">Or paste this link into your browser:<br><span style="word-break: break-all;">${escapeHtml(opts.resetUrl)}</span></p>
      <p style="margin: 32px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">If you did not request this, you can ignore this email — your password stays unchanged.</p>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({ to: opts.to, subject, html, text });
  }

  // Fail closed. The reset URL is a bearer credential and must never
  // be copied into runtime logs, even as a development fallback.
  log.error("Password reset email unavailable: RESEND_API_KEY missing");
  return { ok: false, provider: "no-transport", error: "RESEND_API_KEY not set" };
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
/**
 * Branded payment-link email for the showcase `send_payment_link` Vapi tool.
 */
function redactPayUrlForLog(payUrl: string): { payUrlRedacted: true; payUrlHost?: string } {
  try {
    const parsed = new URL(payUrl);
    return { payUrlRedacted: true, payUrlHost: parsed.hostname };
  } catch {
    return { payUrlRedacted: true };
  }
}

export async function sendPaymentLinkEmail(opts: {
  to: string;
  payUrl: string;
  planLabel?: string;
}): Promise<SendResult> {
  const planSuffix = opts.planLabel ? ` (${escapeHtml(opts.planLabel)} plan)` : "";
  const subject = "Your Wireline payment link";
  const text = [
    "Hi,",
    "",
    `Here's your secure link to activate your Wireline plan${opts.planLabel ? ` (${opts.planLabel} plan)` : ""}:`,
    "",
    opts.payUrl,
    "",
    "Any questions, just call us back on the same number you reached us on.",
    "",
    "— Wireline",
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
      <p style="margin: 0 0 16px; line-height: 1.55;">Hi,</p>
      <p style="margin: 0 0 16px; line-height: 1.55;">Here's your secure link to activate your Wireline plan${planSuffix}.</p>
      <p style="margin: 0 0 24px;"><a href="${escapeHtml(opts.payUrl)}" style="display: inline-block; background: ${BRAND.colors.primary}; color: ${BRAND.colors.onPrimary}; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open payment link</a></p>
      <p style="margin: 0 0 16px; line-height: 1.55; color: #6B6B7A; font-size: 13px;">Or paste this link into your browser:<br><span style="word-break: break-all;">${escapeHtml(opts.payUrl)}</span></p>
      <p style="margin: 24px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">— Wireline</p>
    </div>
  `;

  if (!process.env.RESEND_API_KEY?.trim()) {
    log.warn("send_payment_link called but RESEND_API_KEY is not set — failing loud.", {
      ...emailLogContext(opts.to),
      ...redactPayUrlForLog(opts.payUrl),
    });
    return {
      ok: false,
      provider: "no-transport",
      error: "Email transport not configured (RESEND_API_KEY missing)",
    };
  }

  const sent = await sendViaResend({ to: opts.to, subject, html, text });
  if (!sent.ok) {
    log.error("send_payment_link Resend rejected send", {
      ...emailLogContext(opts.to),
      error: sent.error,
      ...redactPayUrlForLog(opts.payUrl),
    });
  }
  return sent;
}

export async function sendSignupLinkEmail(opts: {
  to: string;
  callerName?: string;
  agentName?: string;
}): Promise<SendResult> {
  const signupUrl = `${(process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "")}/signup`;
  const greetingHtml = firstNameGreeting(opts.callerName);
  const greetingText = opts.callerName ? `Hi ${opts.callerName.trim().split(/\s+/)[0]},` : "Hi,";
  const fromAgentHtml = opts.agentName ? ` — ${escapeHtml(opts.agentName)}` : "";
  const fromAgentText = opts.agentName ? ` — ${opts.agentName}` : "";

  const subject = "Your Wireline sign-up link";
  const text = [
    greetingText,
    "",
    "Thanks for the call. Here's the link to create your free Wireline agent — no credit card required. Build, train, and test it privately, then choose a live plan when you're ready for a customer number:",
    "",
    signupUrl,
    "",
    "If you have any follow-up questions, just call back — same number you reached me on. Looking forward to hearing how your agent turns out.",
    "",
    `— Wireline${fromAgentText}`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
      <p style="margin: 0 0 16px; line-height: 1.55;">${greetingHtml}</p>
      <p style="margin: 0 0 16px; line-height: 1.55;">Thanks for the call. Here's the link to create your <strong>free Wireline agent</strong> — no credit card required. Build, train, and test it privately, then choose a live plan when you're ready for a customer number.</p>
      <p style="margin: 0 0 24px;"><a href="${escapeHtml(signupUrl)}" style="display: inline-block; background: ${BRAND.colors.primary}; color: ${BRAND.colors.onPrimary}; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Create your agent</a></p>
      <p style="margin: 0 0 16px; line-height: 1.55; color: #6B6B7A; font-size: 13px;">Or paste this link into your browser:<br><span style="word-break: break-all;">${escapeHtml(signupUrl)}</span></p>
      <p style="margin: 24px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">If you have any follow-up questions, just call back — same number you reached me on.</p>
      <p style="margin: 24px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">— Wireline${fromAgentHtml}</p>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    const sent = await sendViaResend({ to: opts.to, subject, html, text });
    if (sent.ok) {
      log.info("send_signup_link email accepted by Resend", {
        ...emailLogContext(opts.to),
        resendId: sent.id,
        agentName: opts.agentName,
      });
    } else {
      log.error("send_signup_link Resend rejected send", {
        ...emailLogContext(opts.to),
        error: sent.error,
        agentName: opts.agentName,
      });
    }
    return sent;
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
      ...emailLogContext(opts.to),
      agentName: opts.agentName,
    },
  );
  return {
    ok: false,
    provider: "no-transport",
    error: "Email transport not configured (RESEND_API_KEY missing)",
  };
}

/**
 * Send the email-verification link at signup (and on resend). Single-
 * use token built by auth-service.startEmailVerification() and emailed
 * here in plaintext. Mirrors sendPasswordResetEmail's structure +
 * styling. Returns ok:false if no transport is configured — caller
 * MUST NOT fabricate "sent" UX on a no-transport result; surface the
 * failure cleanly to the user so they can retry once mail is up.
 */
export async function sendEmailVerification(opts: {
  to: string;
  verifyUrl: string;
  fullName?: string | null;
}): Promise<SendResult> {
  const greetingHtml = firstNameGreeting(opts.fullName);
  const greetingText = opts.fullName ? `Hi ${opts.fullName.trim().split(/\s+/)[0]},` : "Hi,";

  const subject = "Verify your Wireline email";
  const text = [
    greetingText,
    "",
    "Welcome to Wireline. Click the link below to verify your email and start building your first voice agent:",
    "",
    opts.verifyUrl,
    "",
    "The link expires in 24 hours. If you didn't sign up, you can ignore this email.",
    "",
    "— Wireline",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
      <p style="margin: 0 0 16px; line-height: 1.55;">${greetingHtml}</p>
      <p style="margin: 0 0 16px; line-height: 1.55;">Welcome to Wireline. Click the button below to verify your email and start building your first voice agent.</p>
      <p style="margin: 0 0 24px;"><a href="${escapeHtml(opts.verifyUrl)}" style="display: inline-block; background: ${BRAND.colors.primary}; color: ${BRAND.colors.onPrimary}; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify email</a></p>
      <p style="margin: 0 0 16px; line-height: 1.55; color: #6B6B7A; font-size: 13px;">Or paste this link into your browser:<br><span style="word-break: break-all;">${escapeHtml(opts.verifyUrl)}</span></p>
      <p style="margin: 32px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">The link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({ to: opts.to, subject, html, text });
  }

  // Same fail-loud pattern as sendSignupLinkEmail. We MUST NOT return
  // ok:true here — the caller (signup endpoint) will tell the user
  // "check your email" but no email actually goes out. Bad UX, worse
  // brand. Better to surface the transport failure so the user can
  // see "verification email transport down — try again in a few".
  log.warn("sendEmailVerification called but RESEND_API_KEY is not set — failing loud.", {
    ...emailLogContext(opts.to),
  });
  return {
    ok: false,
    provider: "no-transport",
    error: "Email transport not configured (RESEND_API_KEY missing)",
  };
}

/**
 * Per-agent escalation email — fires when an agent's
 * escalation_email is set and the `escalate_to_human` tool runs.
 * Designed to feel like a brief from a trusted assistant, not a
 * generic webhook alert.
 */
export async function sendUrgentEscalationEmail(opts: {
  to: string;
  title: string;
  message: string;
  callId?: string;
}): Promise<SendResult> {
  const subject = `🚨 ${opts.title}`;
  const callIdLine = opts.callId ? `Call ID: ${opts.callId}` : "";
  const text = [
    opts.title,
    "",
    opts.message,
    "",
    callIdLine,
    "",
    "This alert was generated by your Wireline voice agent. Reply to your customer at your earliest convenience.",
    "",
    "— Wireline",
  ]
    .filter((s) => s !== "")
    .join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1A1A23; background: #f6f5fa;">
      <div style="background: white; border-radius: 12px; padding: 24px; border: 1px solid rgba(79,30,123,0.08);">
        <div style="display: inline-block; background: rgba(232,70,106,0.10); color: #B91C3E; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 12px;">Urgent · Escalation</div>
        <h2 style="margin: 0 0 12px; font-weight: 600; font-size: 18px;">${escapeHtml(opts.title)}</h2>
        <p style="margin: 0 0 16px; line-height: 1.55; color: #2A2A33;">${escapeHtml(opts.message)}</p>
        ${opts.callId ? `<p style="margin: 0 0 16px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; color: #6B6B7A;">Call ID: ${escapeHtml(opts.callId)}</p>` : ""}
        <hr style="border: 0; border-top: 1px solid rgba(0,0,0,0.06); margin: 20px 0;" />
        <p style="margin: 0; line-height: 1.55; color: #6B6B7A; font-size: 12px;">This alert was generated by your Wireline voice agent. Reply to your customer at your earliest convenience.</p>
      </div>
      <p style="margin: 20px 0 0; text-align: center; color: #9A9AA8; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase;">Wireline</p>
    </div>
  `;
  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({ to: opts.to, subject, html, text });
  }
  log.warn(
    "[email-service] urgent escalation email skipped — RESEND_API_KEY missing. Configure to enable.",
    { ...emailLogContext(opts.to) },
  );
  return {
    ok: false,
    provider: "no-transport",
    error: "Email transport not configured (RESEND_API_KEY missing)",
  };
}

export async function sendPaymentFailedEmail(opts: {
  to: string;
  amountDisplay: string;
  invoiceUrl?: string;
  updateCardUrl: string;
}): Promise<SendResult> {
  const subject = "Your Wireline payment failed";
  const text = [
    "Hi,",
    "",
    `A recent payment of ${opts.amountDisplay} for your Wireline subscription was declined.`,
    "",
    "To keep your agents live, update your payment method:",
    "",
    opts.updateCardUrl,
    "",
    opts.invoiceUrl ? `View invoice: ${opts.invoiceUrl}` : "",
    "",
    "If you have questions, reply to this email — we're happy to help.",
    "",
    "— Wireline",
  ]
    .filter((s) => s !== undefined)
    .join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1A1A23;">
      <h2 style="margin: 0 0 16px; font-weight: 600;">Payment failed</h2>
      <p style="margin: 0 0 16px; line-height: 1.55;">A recent payment of <strong>${escapeHtml(opts.amountDisplay)}</strong> for your Wireline subscription was declined.</p>
      <p style="margin: 0 0 24px; line-height: 1.55;">To keep your agents live, update your payment method.</p>
      <p style="margin: 0 0 24px;"><a href="${escapeHtml(opts.updateCardUrl)}" style="display: inline-block; background: ${BRAND.colors.primary}; color: ${BRAND.colors.onPrimary}; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Update payment method</a></p>
      ${opts.invoiceUrl ? `<p style="margin: 0 0 16px; line-height: 1.55; color: #6B6B7A; font-size: 13px;"><a href="${escapeHtml(opts.invoiceUrl)}" style="color: ${BRAND.colors.primary};">View invoice</a></p>` : ""}
      <p style="margin: 32px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">If you have questions, reply to this email — we're happy to help.</p>
    </div>
  `;
  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({ to: opts.to, subject, html, text });
  }
  log.warn("[email-service] payment failed email skipped — RESEND_API_KEY missing.", {
    ...emailLogContext(opts.to),
  });
  return {
    ok: false,
    provider: "no-transport",
    error: "Email transport not configured (RESEND_API_KEY missing)",
  };
}

export async function sendTrialEndingSoonEmail(opts: {
  to: string;
  daysLeft: number;
  checkoutUrl: string;
}): Promise<SendResult> {
  if (!getPostalAddress()) {
    log.error("Commercial email disabled: WIRELINE_POSTAL_ADDRESS is missing", {
      ...emailLogContext(opts.to),
    });
    return {
      ok: false,
      provider: "no-transport",
      error: "Commercial email compliance is not configured",
    };
  }

  // Commercial (upsell) mail, so it gets the full CAN-SPAM + bulk-sender
  // treatment: honor opt-outs, RFC 8058 one-click unsubscribe headers, and a
  // footer with a working unsubscribe link + physical postal address.
  // (Transactional mail above is exempt.) The demo-line recap in
  // lib/demo-funnel.ts is the other commercial sender and mirrors this shape.
  if (await isEmailSuppressed(opts.to)) {
    log.info("[email-service] trial-ending-soon email skipped — recipient unsubscribed.", {
      ...emailLogContext(opts.to),
    });
    return { ok: false, provider: "no-transport", error: "Recipient has unsubscribed" };
  }

  const dayWord = opts.daysLeft === 1 ? "1 day" : `${opts.daysLeft} days`;
  const subject = `Choose a live plan within ${dayWord}`;
  const text =
    [
      "Hi,",
      "",
      `Your Wireline activation window closes in ${dayWord}.`,
      "",
      "Choose Starter or higher to keep your agents live — your phone number, call history, and agent configuration all carry over. Runtime Balance covers overflow after a paid plan is active.",
      "",
      opts.checkoutUrl,
      "",
      "If you decide not to fund live work, your agents will stop answering calls when activation lapses.",
      "",
      "— Wireline",
    ].join("\n") + buildComplianceFooterText(opts.to);
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1A1A23;">
      <h2 style="margin: 0 0 16px; font-weight: 600;">Fund live work within ${escapeHtml(dayWord)}</h2>
      <p style="margin: 0 0 16px; line-height: 1.55;">Your Wireline activation window closes in <strong>${escapeHtml(dayWord)}</strong>.</p>
      <p style="margin: 0 0 24px; line-height: 1.55;">Choose Starter or higher to keep your agents live — your phone number, call history, and agent configuration all carry over. Runtime Balance covers overflow after a paid plan is active.</p>
      <p style="margin: 0 0 24px;"><a href="${escapeHtml(opts.checkoutUrl)}" style="display: inline-block; background: ${BRAND.colors.primary}; color: ${BRAND.colors.onPrimary}; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Upgrade now</a></p>
      <p style="margin: 32px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">If you decide not to fund live work, your agents will stop answering calls when activation lapses.</p>
      ${buildComplianceFooterHtml(opts.to)}
    </div>
  `;
  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({
      to: opts.to,
      subject,
      html,
      text,
      headers: buildListUnsubscribeHeaders(opts.to),
    });
  }
  log.warn("[email-service] trial-ending-soon email skipped — RESEND_API_KEY missing.", {
    ...emailLogContext(opts.to),
    daysLeft: opts.daysLeft,
  });
  return {
    ok: false,
    provider: "no-transport",
    error: "Email transport not configured (RESEND_API_KEY missing)",
  };
}

/** Tiny HTML escape — sufficient for user-supplied strings and URL attributes. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstNameGreeting(fullName?: string | null): string {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? `Hi ${escapeHtml(first)},` : "Hi,";
}
