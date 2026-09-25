/** Provider-neutral, dependency-injected link-delivery tool logic. */

const APP_URL_DEFAULT = "https://botbound.app";

function isEmailConfirmed(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function looksLikeEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resolveAppUrl(appUrl?: string): string {
  return (appUrl || process.env.APP_URL || APP_URL_DEFAULT).replace(/\/+$/, "");
}

export interface AgentLinkToolLogger {
  error: (message: string, metadata?: Record<string, unknown>) => void;
  info?: (message: string, metadata?: Record<string, unknown>) => void;
}

export interface AgentLinkSendResult {
  ok: boolean;
  error?: string;
  id?: string;
}

export async function handleSendPaymentLink(
  args: { to_email?: string; plan?: string; email_confirmed?: boolean },
  deps: {
    sendPaymentLinkEmail: (options: {
      to: string;
      payUrl: string;
      planLabel?: string;
    }) => Promise<AgentLinkSendResult>;
    appUrl?: string;
    log: AgentLinkToolLogger;
  },
): Promise<{ result: string }> {
  try {
    const { to_email, plan, email_confirmed } = args;
    if (!looksLikeEmail(to_email)) {
      return { result: "I couldn't parse that email. Ask the caller to spell it out, then try again." };
    }
    if (!isEmailConfirmed(email_confirmed)) {
      return {
        result: `Read "${to_email}" back to the caller to confirm, then call send_payment_link again with email_confirmed set to true.`,
      };
    }

    const planParam = plan ? `?plan=${encodeURIComponent(plan)}` : "";
    const payUrl = `${resolveAppUrl(deps.appUrl)}/pricing${planParam}`;
    const sent = await deps.sendPaymentLinkEmail({
      to: to_email,
      payUrl,
      planLabel: plan || undefined,
    });
    if (sent.ok) {
      deps.log.info?.("send_payment_link delivered", { to: to_email, resendId: sent.id, payUrl });
      return {
        result: `DELIVERY_OK: Payment link sent to ${to_email}. Tell the caller it should arrive within a minute. Do not claim delivery unless you see DELIVERY_OK.`,
      };
    }
    deps.log.error("send_payment_link delivery failed", {
      to: to_email,
      error: sent.error,
      payUrl,
    });
    return {
      result: `DELIVERY_FAILED: Email could not be sent (${sent.error || "transport error"}). Do NOT tell the caller it was sent. Read this URL aloud and confirm they wrote it down: ${payUrl}`,
    };
  } catch (error) {
    deps.log.error("send_payment_link tool failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      result: "I wasn't able to send that link right now. Let the caller know they can visit botbound.app/pricing to get started.",
    };
  }
}

export async function handleSendSignupLink(
  args: { to_email?: string; caller_name?: string; email_confirmed?: boolean },
  deps: {
    sendSignupLinkEmail: (options: {
      to: string;
      callerName?: string;
      agentName?: string;
    }) => Promise<AgentLinkSendResult>;
    agentName?: string;
    appUrl?: string;
    log: AgentLinkToolLogger;
  },
): Promise<{ result: string }> {
  try {
    const { to_email, caller_name, email_confirmed } = args;
    if (!looksLikeEmail(to_email)) {
      return {
        result: "I couldn't parse that email. Ask the caller to spell it out letter by letter, then read it back to confirm before trying again.",
      };
    }
    if (!isEmailConfirmed(email_confirmed)) {
      return {
        result: `Before I send this, confirm the address out loud: read "${to_email}" back to the caller slowly, spelling anything ambiguous, and ask "is that correct?". Once they confirm, call send_signup_link again with email_confirmed set to true.`,
      };
    }

    const sent = await deps.sendSignupLinkEmail({
      to: to_email,
      callerName: caller_name,
      agentName: deps.agentName,
    });
    const signupUrl = `${resolveAppUrl(deps.appUrl)}/signup`;
    if (sent.ok) {
      deps.log.info?.("send_signup_link delivered", {
        to: to_email,
        resendId: sent.id,
        agentName: deps.agentName,
      });
      return {
        result: `DELIVERY_OK: Sign-up link sent to ${to_email}. Tell the caller it should arrive within a minute. Do not claim delivery unless you see DELIVERY_OK.`,
      };
    }
    deps.log.error("send_signup_link delivery failed", {
      to: to_email,
      error: sent.error,
      agentName: deps.agentName,
    });
    return {
      result: `DELIVERY_FAILED: Email could not be sent (${sent.error || "transport error"}). Do NOT tell the caller it was sent. Read this URL aloud and confirm they wrote it down: ${signupUrl}`,
    };
  } catch (error) {
    deps.log.error("send_signup_link tool failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      result: "I wasn't able to send that right now. Let the caller know they can sign up at botbound.app/signup, or call us back anytime.",
    };
  }
}
