/**
 * Pure, dependency-injected core logic for the revenue/security-path
 * Vapi tool handlers — `create_account`, `send_payment_link`, and
 * `send_signup_link`.
 *
 * These were originally inline inside the giant `tool-calls` block in
 * `src/routes/vapi/`, which made them untestable. Extracting
 * the branch logic here (with every transport/auth dependency injected)
 * lets the route stay a thin adapter and lets the behavior be tested
 * with mocked deps — no real DB, no real email.
 *
 * The shared guardrail across all three: NEVER send/act on an email
 * address the agent didn't read back and confirm. `email_confirmed`
 * must be strictly `true`; anything else bounces with a re-confirm
 * script so a caller can never get an account/link at a mis-heard
 * address.
 */

const APP_URL_DEFAULT = "https://trywireline.com";

/** Vapi/LLMs may send boolean true as string "true". */
function isEmailConfirmed(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

/** RFC-5322-shape check — the same regex used inline in the route. */
function looksLikeEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Normalize APP_URL into a no-trailing-slash base. */
function resolveAppUrl(appUrl?: string): string {
  return (appUrl || process.env.APP_URL || APP_URL_DEFAULT).replace(/\/+$/, "");
}

/** Minimal logger shape — matches `server-context` `log`. */
export interface ToolHandlerLogger {
  error: (msg: string, meta?: Record<string, unknown>) => void;
  info?: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Result of an email transport send. Only the `ok` flag is load-bearing
 * for these handlers — the real email-service `SendResult` (which also
 * carries `provider`/`id`/`error`) is structurally assignable to this.
 */
export interface SendResultLike {
  ok: boolean;
  error?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// create_account
// ---------------------------------------------------------------------------

export interface CreateAccountArgs {
  to_email?: string;
  caller_name?: string;
  email_confirmed?: boolean;
}

export interface CreateAccountDeps {
  /** authService.signUp — throws if the account already exists. */
  signUp: (email: string, password: string, fullName?: string) => Promise<unknown>;
  /** authService.createPasswordResetToken — returns null when email unknown. */
  createPasswordResetToken: (email: string) => Promise<{ token: string; expiresAt: Date } | null>;
  /** email-service.sendPasswordResetEmail. */
  sendPasswordResetEmail: (opts: {
    to: string;
    resetUrl: string;
    expiresAt: Date;
  }) => Promise<SendResultLike>;
  /** Random temp-password generator (injected for determinism in tests). */
  randomPassword: () => string;
  /** Base app URL; falls back to APP_URL env then trywireline.com. */
  appUrl?: string;
  log: ToolHandlerLogger;
}

/**
 * Core logic for the `create_account` Vapi tool. A Wireline phone agent
 * signs a caller up during the call: creates the account (random temp
 * password), starts the trial via signUp, then emails a set-password
 * link so the caller picks their own.
 *
 * Branch parity with the original inline handler:
 *  - bad email           → "spell it" reprompt, no signUp
 *  - email_confirmed!==true → read-back script, no signUp
 *  - account exists      → friendly "already has an account", no throw
 *  - signUp other error  → caught → snag fallback
 *  - reset email sent    → success message
 *  - reset email failed  → "account created, use Forgot password"
 */
export async function handleCreateAccount(
  args: CreateAccountArgs,
  deps: CreateAccountDeps,
): Promise<{ result: string }> {
  try {
    const { to_email, caller_name, email_confirmed } = args;

    if (!looksLikeEmail(to_email)) {
      return {
        result:
          "I couldn't parse that email. Ask the caller to spell it letter by letter, read it back, then try again.",
      };
    }

    if (!isEmailConfirmed(email_confirmed)) {
      return {
        result: `Before I create the account, read "${to_email}" back to the caller slowly, spelling anything ambiguous, and ask "is that correct?". Once they confirm, call create_account again with email_confirmed set to true.`,
      };
    }

    const tempPassword = deps.randomPassword();
    try {
      await deps.signUp(to_email, tempPassword, caller_name);
    } catch (e: unknown) {
      // Most likely the email already has an account.
      const msg = String((e as { message?: string })?.message || "").toLowerCase();
      if (msg.includes("exist")) {
        return {
          result: `Good news — ${to_email} already has a Wireline account. Tell the caller to sign in at trywireline.com, or offer to send a password reset link.`,
        };
      }
      throw e;
    }

    // Issue a reset token so the caller sets their own password.
    const reset = await deps.createPasswordResetToken(to_email);
    const appUrl = resolveAppUrl(deps.appUrl);
    let emailed = false;
    if (reset?.token) {
      const r = await deps.sendPasswordResetEmail({
        to: to_email,
        resetUrl: `${appUrl}/reset-password?token=${encodeURIComponent(reset.token)}`,
        expiresAt: reset.expiresAt,
      });
      emailed = r.ok;
    }

    return {
      result: emailed
        ? `Account created for ${to_email}. I've emailed them a link to set their password — once they do, they can sign in, create an agent, and fund Conversation Balance when ready for live work. Confirm they got the email before ending the call.`
        : `Account created for ${to_email}, but the welcome email didn't send. Tell the caller to go to trywireline.com, click "Forgot password", and set their password to get in. Their free Builder account is already active.`,
    };
  } catch (err: unknown) {
    deps.log.error("create_account tool failed", {
      error: (err as { message?: string })?.message ?? String(err),
    });
    return {
      result:
        "I hit a snag creating the account. Ask the caller to sign up themselves at trywireline.com/signup — it takes about a minute.",
    };
  }
}

// ---------------------------------------------------------------------------
// send_payment_link
// ---------------------------------------------------------------------------

export interface SendPaymentLinkArgs {
  to_email?: string;
  plan?: string;
  email_confirmed?: boolean;
}

export interface SendPaymentLinkDeps {
  /** email-service.sendPaymentLinkEmail — platform Resend transport. */
  sendPaymentLinkEmail: (opts: {
    to: string;
    payUrl: string;
    planLabel?: string;
  }) => Promise<SendResultLike>;
  appUrl?: string;
  log: ToolHandlerLogger;
}

/**
 * Core logic for the `send_payment_link` Vapi tool — emails the caller a
 * checkout link for a specific plan so they can pay + activate.
 *
 * Branch parity:
 *  - bad email           → "spell it" reprompt, no sendEmail
 *  - email_confirmed!==true → read-back script, no sendEmail
 *  - sendEmail ok        → success message
 *  - sendEmail !ok       → "read the link by mouth" fallback
 *  - thrown error        → caught → snag fallback
 */
export async function handleSendPaymentLink(
  args: SendPaymentLinkArgs,
  deps: SendPaymentLinkDeps,
): Promise<{ result: string }> {
  try {
    const { to_email, plan, email_confirmed } = args;

    if (!looksLikeEmail(to_email)) {
      return {
        result: "I couldn't parse that email. Ask the caller to spell it out, then try again.",
      };
    }

    if (!isEmailConfirmed(email_confirmed)) {
      return {
        result: `Read "${to_email}" back to the caller to confirm, then call send_payment_link again with email_confirmed set to true.`,
      };
    }

    const appUrl = resolveAppUrl(deps.appUrl);
    // Checkout link — the pricing page deep-links to Stripe checkout
    // per plan once the caller is signed in.
    const planParam = plan ? `?plan=${encodeURIComponent(plan)}` : "";
    const payUrl = `${appUrl}/billing${planParam}`;
    const r = await deps.sendPaymentLinkEmail({
      to: to_email,
      payUrl,
      planLabel: plan || undefined,
    });

    if (r.ok) {
      deps.log.info?.("send_payment_link delivered", {
        to: to_email,
        resendId: r.id,
        payUrl,
      });
      return {
        result: `DELIVERY_OK: Payment link sent to ${to_email}. Tell the caller it should arrive within a minute. Do not claim delivery unless you see DELIVERY_OK.`,
      };
    }

    deps.log.error("send_payment_link delivery failed", {
      to: to_email,
      error: r.error,
      payUrl,
    });
    return {
      result: `DELIVERY_FAILED: Email could not be sent (${r.error || "transport error"}). Do NOT tell the caller it was sent. Read this URL aloud and confirm they wrote it down: ${payUrl}`,
    };
  } catch (err: unknown) {
    deps.log.error("send_payment_link tool failed", {
      error: (err as { message?: string })?.message ?? String(err),
    });
    return {
      result:
        "I wasn't able to send that link right now. Let the caller know they can visit trywireline.com/billing to get started.",
    };
  }
}

// ---------------------------------------------------------------------------
// send_signup_link
// ---------------------------------------------------------------------------

export interface SendSignupLinkArgs {
  to_email?: string;
  caller_name?: string;
  email_confirmed?: boolean;
}

export interface SendSignupLinkDeps {
  /** email-service.sendSignupLinkEmail — platform Resend transport. */
  sendSignupLinkEmail: (opts: {
    to: string;
    callerName?: string;
    agentName?: string;
  }) => Promise<SendResultLike>;
  /** The agent's display name (Sarah / Liam / …); looked up by the route. */
  agentName?: string;
  appUrl?: string;
  log: ToolHandlerLogger;
}

/**
 * Core logic for the `send_signup_link` Vapi tool — emails a 14-day
 * trial signup link. Used by the showcase/demo agents.
 *
 * Branch parity:
 *  - bad email           → "spell it" reprompt, no send
 *  - email_confirmed!==true → read-back script, no send
 *  - send ok             → success message
 *  - send !ok            → "read the URL by mouth" fallback
 *  - thrown error        → caught → call-back fallback
 */
export async function handleSendSignupLink(
  args: SendSignupLinkArgs,
  deps: SendSignupLinkDeps,
): Promise<{ result: string }> {
  try {
    const { to_email, caller_name, email_confirmed } = args;

    if (!looksLikeEmail(to_email)) {
      return {
        result:
          "I couldn't parse that email. Ask the caller to spell it out letter by letter, then read it back to confirm before trying again.",
      };
    }

    if (!isEmailConfirmed(email_confirmed)) {
      // Server-side guardrail: never send to an address the agent
      // didn't explicitly confirm with the caller.
      return {
        result: `Before I send this, confirm the address out loud: read "${to_email}" back to the caller slowly, spelling anything ambiguous, and ask "is that correct?". Once they confirm, call send_signup_link again with email_confirmed set to true.`,
      };
    }

    const result = await deps.sendSignupLinkEmail({
      to: to_email,
      callerName: caller_name,
      agentName: deps.agentName,
    });
    const signupUrl = `${resolveAppUrl(deps.appUrl)}/signup`;
    if (result.ok) {
      deps.log.info?.("send_signup_link delivered", {
        to: to_email,
        resendId: result.id,
        agentName: deps.agentName,
      });
      return {
        result: `DELIVERY_OK: Sign-up link sent to ${to_email}. Tell the caller it should arrive within a minute. Do not claim delivery unless you see DELIVERY_OK.`,
      };
    }

    deps.log.error("send_signup_link delivery failed", {
      to: to_email,
      error: result.error,
      agentName: deps.agentName,
    });
    return {
      result: `DELIVERY_FAILED: Email could not be sent (${result.error || "transport error"}). Do NOT tell the caller it was sent. Read this URL aloud and confirm they wrote it down: ${signupUrl}`,
    };
  } catch (err: unknown) {
    deps.log.error("send_signup_link tool failed", {
      error: (err as { message?: string })?.message ?? String(err),
    });
    return {
      result:
        "I wasn't able to send that right now. Let the caller know they can sign up at trywireline.com/signup, or call us back anytime.",
    };
  }
}
