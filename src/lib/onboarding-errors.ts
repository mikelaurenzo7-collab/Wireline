/**
 * onboarding-errors.ts
 *
 * Human-readable error messages for SMB onboarding failure paths.
 *
 * The goal: never show a technical error to a non-technical business owner.
 * Every error should:
 *   1. Explain what happened in plain English
 *   2. Give a clear next step
 *   3. Offer an escape hatch (skip, try again, or contact support)
 */

export interface FriendlyError {
  title: string;
  message: string;
  action: string;
  secondaryAction?: string;
  severity: "info" | "warning" | "error";
  canRetry: boolean;
  canSkip: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Catalog
// ─────────────────────────────────────────────────────────────────────────────

export const ONBOARDING_ERRORS = {
  // Agent creation errors
  AGENT_CREATE_FAILED: {
    title: "We couldn't create your agent",
    message:
      "Our AI service is temporarily busy. This usually clears up in a few seconds — it's not something you did wrong.",
    action: "Try again",
    severity: "warning" as const,
    canRetry: true,
    canSkip: false,
  },

  AGENT_NAME_TAKEN: {
    title: "That name is already in use",
    message:
      "You have another agent with a similar name. Try something more specific to this agent's job.",
    action: "Change the name",
    severity: "info" as const,
    canRetry: true,
    canSkip: false,
  },

  // Knowledge / website errors
  KNOWLEDGE_FETCH_FAILED: {
    title: "We couldn't read your website",
    message:
      "This usually happens when a website blocks automated access, or the URL isn't quite right. You can skip this and add your business details manually later — it only takes a minute.",
    action: "Try a different URL",
    secondaryAction: "Skip for now",
    severity: "warning" as const,
    canRetry: true,
    canSkip: true,
  },

  WEBSITE_UNREACHABLE: {
    title: "That website isn't responding",
    message:
      "We couldn't reach the URL you provided. Check for typos and make sure it starts with https://",
    action: "Check URL and retry",
    secondaryAction: "Skip for now",
    severity: "warning" as const,
    canRetry: true,
    canSkip: true,
  },

  WEBSITE_NO_CONTENT: {
    title: "We found your site, but couldn't extract details",
    message:
      "Your website might use a format we can't automatically read. No problem — you can add your services and policies manually in about 2 minutes.",
    action: "Add details manually",
    secondaryAction: "Skip for now",
    severity: "info" as const,
    canRetry: false,
    canSkip: true,
  },

  // Phone number errors
  PHONE_PROVISION_FAILED: {
    title: "We're out of phone numbers in that area",
    message:
      "This happens sometimes with popular area codes. Try a nearby area code, or skip this step — your agent will work with browser test calls while we restock.",
    action: "Try different area code",
    secondaryAction: "Skip for now",
    severity: "warning" as const,
    canRetry: true,
    canSkip: true,
  },

  PHONE_INVALID_AREA_CODE: {
    title: "That doesn't look like a valid area code",
    message: "Area codes are 3 digits, like 212 (New York) or 415 (San Francisco).",
    action: "Fix area code",
    severity: "info" as const,
    canRetry: true,
    canSkip: true,
  },

  PHONE_RATE_LIMITED: {
    title: "We've hit a temporary limit on phone numbers",
    message:
      "Our carrier limits how many numbers we can provision per minute. Wait about 60 seconds and try again.",
    action: "Wait and retry",
    secondaryAction: "Skip for now",
    severity: "warning" as const,
    canRetry: true,
    canSkip: true,
  },

  // Voice/test call errors
  VOICE_PREVIEW_FAILED: {
    title: "Couldn't play voice preview",
    message:
      "There was a problem loading the voice sample. This is usually temporary — try another voice or continue with your selection.",
    action: "Try another voice",
    severity: "info" as const,
    canRetry: true,
    canSkip: true,
  },

  TEST_CALL_FAILED: {
    title: "Couldn't connect test call",
    message:
      "Your agent is set up correctly, but we couldn't connect the test call. This might be a browser permission issue or a temporary network problem.",
    action: "Check microphone permissions",
    secondaryAction: "Try again later",
    severity: "warning" as const,
    canRetry: true,
    canSkip: true,
  },

  // Validation errors
  INVALID_URL: {
    title: "That doesn't look like a website URL",
    message: "Website URLs should start with https:// — for example: https://yourbusiness.com",
    action: "Fix the URL",
    severity: "info" as const,
    canRetry: true,
    canSkip: true,
  },

  INVALID_EMAIL: {
    title: "That email address doesn't look right",
    message: "Email addresses need an @ symbol and a domain, like you@yourbusiness.com",
    action: "Fix email address",
    severity: "info" as const,
    canRetry: true,
    canSkip: false,
  },

  REQUIRED_FIELD_MISSING: {
    title: "Please fill this out",
    message:
      "This information is needed to set up your agent. If you're not sure, just give us your best guess — you can always change it later.",
    action: "Add the missing info",
    severity: "info" as const,
    canRetry: true,
    canSkip: false,
  },

  // System/network errors
  NETWORK_ERROR: {
    title: "Connection trouble",
    message: "We couldn't reach our servers. Check your internet connection and try again.",
    action: "Try again",
    severity: "warning" as const,
    canRetry: true,
    canSkip: false,
  },

  SESSION_EXPIRED: {
    title: "Your session expired",
    message: "You've been logged out for security. Sign back in and your progress should be saved.",
    action: "Sign in again",
    severity: "info" as const,
    canRetry: true,
    canSkip: false,
  },

  UNKNOWN_ERROR: {
    title: "Something unexpected happened",
    message:
      "Our team has been automatically notified. You can try again, or contact support if this keeps happening.",
    action: "Try again",
    secondaryAction: "Contact support",
    severity: "error" as const,
    canRetry: true,
    canSkip: false,
  },

  // Subscription/billing errors
  TRIAL_EXPIRED: {
    title: "Your trial has ended",
    message:
      "To keep your agent running, you'll need to upgrade to a paid plan. It takes about a minute.",
    action: "Upgrade now",
    severity: "info" as const,
    canRetry: false,
    canSkip: false,
  },

  PAYMENT_REQUIRED: {
    title: "Payment needed to continue",
    message:
      "We need a payment method on file before you can provision a phone number. This is just how phone carriers work.",
    action: "Add payment method",
    severity: "info" as const,
    canRetry: false,
    canSkip: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Error Mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a technical error to a human-readable FriendlyError.
 * This is the main entry point for error handling in onboarding flows.
 */
export function mapErrorToFriendly(
  error: unknown,
  context: keyof typeof ONBOARDING_ERRORS = "UNKNOWN_ERROR",
): FriendlyError {
  const message = error instanceof Error ? error.message : String(error);
  const err = error as { statusCode?: number; status?: number } | null;
  const statusCode = err?.statusCode || err?.status;

  // HTTP status code mapping
  if (statusCode === 401 || statusCode === 403) {
    return ONBOARDING_ERRORS.SESSION_EXPIRED;
  }
  if (statusCode === 429) {
    return ONBOARDING_ERRORS.PHONE_RATE_LIMITED;
  }
  if (statusCode === 402) {
    return ONBOARDING_ERRORS.PAYMENT_REQUIRED;
  }

  // Message pattern matching
  if (/url|website|http|ENOTFOUND|404|scrape/i.test(message)) {
    if (/blocked|forbidden|403/i.test(message)) {
      return ONBOARDING_ERRORS.KNOWLEDGE_FETCH_FAILED;
    }
    if (/timeout|unreachable|ECONNREFUSED/i.test(message)) {
      return ONBOARDING_ERRORS.WEBSITE_UNREACHABLE;
    }
    if (/empty|no content/i.test(message)) {
      return ONBOARDING_ERRORS.WEBSITE_NO_CONTENT;
    }
    return ONBOARDING_ERRORS.KNOWLEDGE_FETCH_FAILED;
  }

  if (/phone|number|twilio|area.*code/i.test(message)) {
    if (/rate.*limit|too.*many/i.test(message)) {
      return ONBOARDING_ERRORS.PHONE_RATE_LIMITED;
    }
    if (/invalid.*area|not.*valid/i.test(message)) {
      return ONBOARDING_ERRORS.PHONE_INVALID_AREA_CODE;
    }
    if (/unavailable|out.*of|no.*numbers/i.test(message)) {
      return ONBOARDING_ERRORS.PHONE_PROVISION_FAILED;
    }
    return ONBOARDING_ERRORS.PHONE_PROVISION_FAILED;
  }

  if (/agent|create|already.*exist|duplicate/i.test(message)) {
    if (/name.*taken|already.*exist|duplicate/i.test(message)) {
      return ONBOARDING_ERRORS.AGENT_NAME_TAKEN;
    }
    return ONBOARDING_ERRORS.AGENT_CREATE_FAILED;
  }

  if (/network|fetch|ECONNREFUSED|timeout/i.test(message)) {
    return ONBOARDING_ERRORS.NETWORK_ERROR;
  }

  if (/voice|preview|audio/i.test(message)) {
    return ONBOARDING_ERRORS.VOICE_PREVIEW_FAILED;
  }

  if (/test.*call|microphone|permission/i.test(message)) {
    return ONBOARDING_ERRORS.TEST_CALL_FAILED;
  }

  if (/email|invalid.*email/i.test(message)) {
    return ONBOARDING_ERRORS.INVALID_EMAIL;
  }

  if (/required|missing|empty/i.test(message)) {
    return ONBOARDING_ERRORS.REQUIRED_FIELD_MISSING;
  }

  if (/trial.*expired|trial.*end/i.test(message)) {
    return ONBOARDING_ERRORS.TRIAL_EXPIRED;
  }

  // Default to provided context or unknown
  return ONBOARDING_ERRORS[context] || ONBOARDING_ERRORS.UNKNOWN_ERROR;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentry / Analytics Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Track onboarding errors for analytics while showing friendly messages to users.
 */
export function logOnboardingError(
  step: string,
  error: unknown,
  friendlyError: FriendlyError,
  userAction: "retry" | "skip" | "contact_support" | "abandon",
) {
  const payload = {
    step,
    errorType: friendlyError.title,
    errorMessage: error instanceof Error ? error.message : String(error),
    userAction,
    timestamp: new Date().toISOString(),
  };

  // Log to console in development
  if (process.env.NODE_ENV === "development") {
    console.error("[Onboarding Error]", payload);
  }

  // Send to analytics if available
  if (typeof window !== "undefined" && window.plausible) {
    window.plausible("OnboardingError", {
      props: {
        step,
        error_type: friendlyError.title,
        user_action: userAction,
      },
    });
  }

  // Could also send to Sentry here
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate exponential backoff delay for retries.
 */
export function getRetryDelay(attemptNumber: number, baseDelayMs = 1000): number {
  // Exponential backoff with jitter: 1s, 2s, 4s, 8s max
  const delay = Math.min(baseDelayMs * Math.pow(2, attemptNumber), 8000);
  const jitter = Math.random() * 0.3 * delay; // 0-30% jitter
  return Math.round(delay + jitter);
}

/**
 * Check if an error is likely transient (worth retrying).
 */
export function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  const transientPatterns = [
    /timeout/i,
    /network/i,
    /ECONNREFUSED/i,
    /rate.*limit/i,
    /busy/i,
    /temporarily/i,
    /503/i,
    /502/i,
    /504/i,
    /429/i,
  ];

  return transientPatterns.some((pattern) => pattern.test(message));
}
