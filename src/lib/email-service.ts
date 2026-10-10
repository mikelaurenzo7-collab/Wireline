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
import { liveExternalActionPolicyForUser } from "./account-environment-policy";
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
import { resolveCanonicalAppUrl } from "./app-url";
import {
  formatResendApiError,
  getResendTransportDiagnostics,
  resolveResendFromAddress,
} from "./resend-config";

export interface SendResult {
  ok: boolean;
  provider: "resend" | "log-fallback" | "no-transport";
  disposition: "accepted" | "suppressed" | "failed";
  id?: string;
  error?: string;
}

async function tenantEmailPolicyBlock(userId: string, action: string): Promise<SendResult | null> {
  const policy = await liveExternalActionPolicyForUser(userId);
  if (policy.allowed) return null;
  log.info("[email-service] tenant email suppressed by account environment", {
    userId,
    action,
    accountEnvironment: policy.environment ?? "missing",
    code: policy.code,
  });
  return {
    ok: false,
    provider: "no-transport",
    disposition: "suppressed",
    error: policy.message,
  };
}

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
  headers?: Record<string, string>;
  idempotencyKey?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      provider: "resend",
      disposition: "failed",
      error: "RESEND_API_KEY not set",
    };
  }

  try {
    if (await isProviderDeliverySuppressed(args.to)) {
      log.warn("[email-service] Resend send blocked by provider delivery suppression", {
        ...emailLogContext(args.to),
      });
      return {
        ok: false,
        provider: "resend",
        disposition: "suppressed",
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
      disposition: "failed",
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
        ...(args.idempotencyKey ? { "Idempotency-Key": args.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        ...(args.headers && Object.keys(args.headers).length ? { headers: args.headers } : {}),
      }),
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
        disposition: "failed",
        error,
      };
    }
    const parsed = body ? JSON.parse(body) : {};
    log.info("[email-service] Resend accepted send", {
      ...emailLogContext(args.to),
      from,
      resendId: parsed?.id,
    });
    return { ok: true, provider: "resend", disposition: "accepted", id: parsed?.id };
  } catch (err) {
    const error = getErrorMessage(err);
    log.error("[email-service] Resend transport error", {
      ...emailLogContext(args.to),
      from,
      error,
      transport: getResendTransportDiagnostics(),
    });
    return { ok: false, provider: "resend", disposition: "failed", error };
  }
}

/** Generic transactional email send. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      provider: "no-transport",
      disposition: "failed",
      error: "RESEND_API_KEY not set",
    };
  }
  return await sendViaResend(opts);
}

/** Provider-backed platform email explicitly owned by one tenant workspace. */
export async function sendTenantEmail(opts: {
  userId: string;
  action: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}): Promise<SendResult> {
  const blocked = await tenantEmailPolicyBlock(opts.userId, opts.action);
  if (blocked) return blocked;
  return sendEmail({
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    headers: opts.headers,
    idempotencyKey: opts.idempotencyKey,
  });
}

export async function sendPasswordResetEmail(opts: PasswordResetEmailOpts): Promise<SendResult> {
  const expiresHuman = `${Math.max(1, Math.round((opts.expiresAt.getTime() - Date.now()) / 60_000))} min`;

  const subject = "Reset your BotBound password";
  const text = [
    "Someone (hopefully you) requested a password reset for your BotBound account.",
    "",
    `Click the link below to set a new password. The link expires in ${expiresHuman}.`,
    "",
    opts.resetUrl,
    "",
    "If you did not request this, you can ignore this email, your password stays unchanged.",
    "",
    "BotBound",
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1A1A23;">
      <h2 style="margin: 0 0 16px; font-weight: 600;">Reset your BotBound password</h2>
      <p style="margin: 0 0 16px; line-height: 1.55;">Someone (hopefully you) requested a password reset for your BotBound account.</p>
      <p style="margin: 0 0 24px; line-height: 1.55;">Click the button below to set a new password. The link expires in <strong>${expiresHuman}</strong>.</p>
      <p style="margin: 0 0 24px;"><a href="${escapeHtml(opts.resetUrl)}" style="display: inline-block; background: ${BRAND.colors.primary}; color: ${BRAND.colors.onPrimary}; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reset password</a></p>
      <p style="margin: 0 0 16px; line-height: 1.55; color: #6B6B7A; font-size: 13px;">Or paste this link into your browser:<br><span style="word-break: break-all;">${escapeHtml(opts.resetUrl)}</span></p>
      <p style="margin: 32px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">If you did not request this, you can ignore this email, your password stays unchanged.</p>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({ to: opts.to, subject, html, text });
  }

  log.error("Password reset email unavailable: RESEND_API_KEY missing");
  return {
    ok: false,
    provider: "no-transport",
    disposition: "failed",
    error: "RESEND_API_KEY not set",
  };
}

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
  const subject = "Your BotBound payment link";
  const text = [
    "Hi,",
    "",
    `Here's your secure link to activate your BotBound plan${opts.planLabel ? ` (${opts.planLabel} plan)` : ""}:`,
    "",
    opts.payUrl,
    "",
    "Any questions, just call us back on the same number you reached us on.",
    "",
    "BotBound",
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
      <p style="margin: 0 0 16px; line-height: 1.55;">Hi,</p>
      <p style="margin: 0 0 16px; line-height: 1.55;">Here's your secure link to activate your BotBound plan${planSuffix}.</p>
      <p style="margin: 0 0 24px;"><a href="${escapeHtml(opts.payUrl)}" style="display: inline-block; background: ${BRAND.colors.primary}; color: ${BRAND.colors.onPrimary}; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open payment link</a></p>
      <p style="margin: 0 0 16px; line-height: 1.55; color: #6B6B7A; font-size: 13px;">Or paste this link into your browser:<br><span style="word-break: break-all;">${escapeHtml(opts.payUrl)}</span></p>
      <p style="margin: 24px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">BotBound</p>
    </div>
  `;

  if (!process.env.RESEND_API_KEY?.trim()) {
    log.warn("send_payment_link called but RESEND_API_KEY is not set, failing loud.", {
      ...emailLogContext(opts.to),
      ...redactPayUrlForLog(opts.payUrl),
    });
    return {
      ok: false,
      provider: "no-transport",
      disposition: "failed",
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
  const canonical = resolveCanonicalAppUrl();
  if ("error" in canonical) {
    log.error("send_signup_link called without a canonical APP_URL", emailLogContext(opts.to));
    return {
      ok: false,
      provider: "no-transport",
      disposition: "failed",
      error: "Canonical app URL not configured (APP_URL missing)",
    };
  }
  const signupUrl = `${canonical.url}/signup`;
  const greetingHtml = firstNameGreeting(opts.callerName);
  const greetingText = opts.callerName ? `Hi ${opts.callerName.trim().split(/\s+/)[0]},` : "Hi,";
  const fromAgentHtml = opts.agentName ? `, ${escapeHtml(opts.agentName)}` : "";
  const fromAgentText = opts.agentName ? `, ${opts.agentName}` : "";

  const subject = "Your BotBound sign-up link";
  const text = [
    greetingText,
    "",
    "Thanks for the call. Here's the link to create your free BotBound Bot, no credit card required. Add its knowledge, then rehearse a private conversation. Choose a live plan when you're ready for a customer number:",
    "",
    signupUrl,
    "",
    "If you have any follow-up questions, just call back, same number you reached me on. Looking forward to hearing how your Bot turns out.",
    "",
    `BotBound${fromAgentText}`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
      <p style="margin: 0 0 16px; line-height: 1.55;">${greetingHtml}</p>
      <p style="margin: 0 0 16px; line-height: 1.55;">Thanks for the call. Here's the link to create your <strong>free BotBound Bot</strong>, no credit card required. Add its knowledge, then rehearse a private conversation. Choose a live plan when you're ready for a customer number.</p>
      <p style="margin: 0 0 24px;"><a href="${escapeHtml(signupUrl)}" style="display: inline-block; background: ${BRAND.colors.primary}; color: ${BRAND.colors.onPrimary}; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Create your Bot</a></p>
      <p style="margin: 0 0 16px; line-height: 1.55; color: #6B6B7A; font-size: 13px;">Or paste this link into your browser:<br><span style="word-break: break-all;">${escapeHtml(signupUrl)}</span></p>
      <p style="margin: 24px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">If you have any follow-up questions, just call back, same number you reached me on.</p>
      <p style="margin: 24px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">BotBound${fromAgentHtml}</p>
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

  log.warn(
    "send_signup_link called but RESEND_API_KEY is not set, failing loud so the agent doesn't lie about delivery.",
    {
      ...emailLogContext(opts.to),
      agentName: opts.agentName,
    },
  );
  return {
    ok: false,
    provider: "no-transport",
    disposition: "failed",
    error: "Email transport not configured (RESEND_API_KEY missing)",
  };
}

export async function sendEmailVerification(opts: {
  to: string;
  verifyUrl: string;
  fullName?: string | null;
}): Promise<SendResult> {
  const greetingHtml = firstNameGreeting(opts.fullName);
  const greetingText = opts.fullName ? `Hi ${opts.fullName.trim().split(/\s+/)[0]},` : "Hi,";

  const subject = "Verify your BotBound email";
  const text = [
    greetingText,
    "",
    "Welcome to BotBound. Click the link below to verify your email and start building your first Bot:",
    "",
    opts.verifyUrl,
    "",
    "The link expires in 24 hours. If you didn't sign up, you can ignore this email.",
    "",
    "BotBound",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
      <p style="margin: 0 0 16px; line-height: 1.55;">${greetingHtml}</p>
      <p style="margin: 0 0 16px; line-height: 1.55;">Welcome to BotBound. Click the button below to verify your email and start building your first Bot.</p>
      <p style="margin: 0 0 24px;"><a href="${escapeHtml(opts.verifyUrl)}" style="display: inline-block; background: ${BRAND.colors.primary}; color: ${BRAND.colors.onPrimary}; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify email</a></p>
      <p style="margin: 0 0 16px; line-height: 1.55; color: #6B6B7A; font-size: 13px;">Or paste this link into your browser:<br><span style="word-break: break-all;">${escapeHtml(opts.verifyUrl)}</span></p>
      <p style="margin: 32px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">The link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({ to: opts.to, subject, html, text });
  }

  log.warn("sendEmailVerification called but RESEND_API_KEY is not set, failing loud.", {
    ...emailLogContext(opts.to),
  });
  return {
    ok: false,
    provider: "no-transport",
    disposition: "failed",
    error: "Email transport not configured (RESEND_API_KEY missing)",
  };
}

export async function sendUrgentEscalationEmail(opts: {
  userId: string;
  to: string;
  title: string;
  message: string;
  callId?: string;
}): Promise<SendResult> {
  const blocked = await tenantEmailPolicyBlock(opts.userId, "urgent_escalation_email");
  if (blocked) return blocked;
  const subject = `🚨 ${opts.title}`;
  const callIdLine = opts.callId ? `Call ID: ${opts.callId}` : "";
  const text = [
    opts.title,
    "",
    opts.message,
    "",
    callIdLine,
    "",
    "This alert was generated by your BotBound Bot. Reply to your customer at your earliest convenience.",
    "",
    "BotBound",
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
        <p style="margin: 0; line-height: 1.55; color: #6B6B7A; font-size: 12px;">This alert was generated by your BotBound Bot. Reply to your customer at your earliest convenience.</p>
      </div>
      <p style="margin: 20px 0 0; text-align: center; color: #9A9AA8; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase;">BotBound</p>
    </div>
  `;
  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({ to: opts.to, subject, html, text });
  }
  log.warn(
    "[email-service] urgent escalation email skipped, RESEND_API_KEY missing. Configure to enable.",
    { ...emailLogContext(opts.to) },
  );
  return {
    ok: false,
    provider: "no-transport",
    disposition: "failed",
    error: "Email transport not configured (RESEND_API_KEY missing)",
  };
}

export async function sendPaymentFailedEmail(opts: {
  userId: string;
  to: string;
  amountDisplay: string;
  invoiceUrl?: string;
  updateCardUrl: string;
  idempotencyKey?: string;
}): Promise<SendResult> {
  const blocked = await tenantEmailPolicyBlock(opts.userId, "payment_failed_email");
  if (blocked) return blocked;
  const subject = "Your BotBound payment failed";
  const text = [
    "Hi,",
    "",
    `A recent payment of ${opts.amountDisplay} for your BotBound subscription was declined.`,
    "",
    "To keep your Bots live, update your payment method:",
    "",
    opts.updateCardUrl,
    "",
    opts.invoiceUrl ? `View invoice: ${opts.invoiceUrl}` : "",
    "",
    "If you have questions, reply to this email, we're happy to help.",
    "",
    "BotBound",
  ]
    .filter((s) => s !== undefined)
    .join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1A1A23;">
      <h2 style="margin: 0 0 16px; font-weight: 600;">Payment failed</h2>
      <p style="margin: 0 0 16px; line-height: 1.55;">A recent payment of <strong>${escapeHtml(opts.amountDisplay)}</strong> for your BotBound subscription was declined.</p>
      <p style="margin: 0 0 24px; line-height: 1.55;">To keep your Bots live, update your payment method.</p>
      <p style="margin: 0 0 24px;"><a href="${escapeHtml(opts.updateCardUrl)}" style="display: inline-block; background: ${BRAND.colors.primary}; color: ${BRAND.colors.onPrimary}; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Update payment method</a></p>
      ${opts.invoiceUrl ? `<p style="margin: 0 0 16px; line-height: 1.55; color: #6B6B7A; font-size: 13px;"><a href="${escapeHtml(opts.invoiceUrl)}" style="color: ${BRAND.colors.primary};">View invoice</a></p>` : ""}
      <p style="margin: 32px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">If you have questions, reply to this email, we're happy to help.</p>
    </div>
  `;
  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({
      to: opts.to,
      subject,
      html,
      text,
      idempotencyKey: opts.idempotencyKey,
    });
  }
  log.warn("[email-service] payment failed email skipped, RESEND_API_KEY missing.", {
    ...emailLogContext(opts.to),
  });
  return {
    ok: false,
    provider: "no-transport",
    disposition: "failed",
    error: "Email transport not configured (RESEND_API_KEY missing)",
  };
}

export async function sendTrialEndingSoonEmail(opts: {
  userId: string;
  to: string;
  daysLeft: number;
  checkoutUrl: string;
  idempotencyKey?: string;
}): Promise<SendResult> {
  const blocked = await tenantEmailPolicyBlock(opts.userId, "trial_ending_soon_email");
  if (blocked) return blocked;
  if (!getPostalAddress()) {
    log.error("Commercial email disabled: WIRELINE_POSTAL_ADDRESS is missing", {
      ...emailLogContext(opts.to),
    });
    return {
      ok: false,
      provider: "no-transport",
      disposition: "failed",
      error: "Commercial email compliance is not configured",
    };
  }

  if (await isEmailSuppressed(opts.to)) {
    log.info("[email-service] trial-ending-soon email skipped, recipient unsubscribed.", {
      ...emailLogContext(opts.to),
    });
    return {
      ok: false,
      provider: "no-transport",
      disposition: "suppressed",
      error: "Recipient has unsubscribed",
    };
  }

  const dayWord = opts.daysLeft === 1 ? "1 day" : `${opts.daysLeft} days`;
  const subject = `Choose a live plan within ${dayWord}`;
  const text =
    [
      "Hi,",
      "",
      `Your BotBound activation window closes in ${dayWord}.`,
      "",
      "Choose a Calls, Email, or Calls + Email plan to keep your Bots live. Your phone number, call history, and Bot configuration all carry over. Runtime Balance covers overflow after a paid plan is active.",
      "",
      opts.checkoutUrl,
      "",
      "If you decide not to fund live work, your Bots will stop answering calls when activation lapses.",
      "",
      "BotBound",
    ].join("\n") + buildComplianceFooterText(opts.to);
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1A1A23;">
      <h2 style="margin: 0 0 16px; font-weight: 600;">Fund live work within ${escapeHtml(dayWord)}</h2>
      <p style="margin: 0 0 16px; line-height: 1.55;">Your BotBound activation window closes in <strong>${escapeHtml(dayWord)}</strong>.</p>
      <p style="margin: 0 0 24px; line-height: 1.55;">Choose a Calls, Email, or Calls + Email plan to keep your Bots live. Your phone number, call history, and Bot configuration all carry over. Runtime Balance covers overflow after a paid plan is active.</p>
      <p style="margin: 0 0 24px;"><a href="${escapeHtml(opts.checkoutUrl)}" style="display: inline-block; background: ${BRAND.colors.primary}; color: ${BRAND.colors.onPrimary}; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Upgrade now</a></p>
      <p style="margin: 32px 0 0; line-height: 1.55; color: #6B6B7A; font-size: 13px;">If you decide not to fund live work, your Bots will stop answering calls when activation lapses.</p>
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
      idempotencyKey: opts.idempotencyKey,
    });
  }
  log.warn("[email-service] trial-ending-soon email skipped, RESEND_API_KEY missing.", {
    ...emailLogContext(opts.to),
    daysLeft: opts.daysLeft,
  });
  return {
    ok: false,
    provider: "no-transport",
    disposition: "failed",
    error: "Email transport not configured (RESEND_API_KEY missing)",
  };
}

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
