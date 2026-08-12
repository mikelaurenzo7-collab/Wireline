/**
 * /api/support/ticket — public support form intake.
 *
 * The /support page POSTs here. We:
 *   1. Validate and normalize the public payload
 *   2. Fail-closed rate-limit per IP so the form cannot become a spam relay
 *   3. Honor provider delivery suppression before attempting Resend
 *   4. Email the staffed support inbox with Reply-To set to the submitter
 *   5. Return an actionable failure so the page can fall back to direct email
 *
 * Auth not required — pre-signup visitors with a billing question
 * need to reach us too.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { AppError } from "../lib/api-error";
import { normalizeEmail } from "../lib/email-compliance";
import { isProviderDeliverySuppressed } from "../lib/email-delivery-suppression";
import { distributedLimiterStatus, rateLimit } from "../lib/rate-limit";
import { formatResendApiError, resolveResendFromAddress } from "../lib/resend-config";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";

/**
 * The support form keeps its direct Resend transport so Reply-To can point at
 * the submitter, but it must honor the same provider-feedback suppression
 * boundary as every other platform Resend sender. A suppression-store failure
 * fails closed rather than retrying an address Resend has already rejected.
 */
async function sendSupportEmail(args: {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" };

  try {
    if (await isProviderDeliverySuppressed(args.to)) {
      log.warn("Support email blocked by provider delivery suppression");
      return {
        ok: false,
        error: "Support inbox is suppressed after provider delivery feedback.",
      };
    }
  } catch (err) {
    log.error("Support email delivery-suppression check failed", {
      error: getErrorMessage(err),
    });
    return { ok: false, error: "Email delivery safety check unavailable" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resolveResendFromAddress(),
        to: args.to,
        reply_to: args.replyTo,
        subject: args.subject,
        text: args.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, error: formatResendApiError(res.status, body) };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) throw err;
    return { ok: false, error: getErrorMessage(err) };
  }
}

const router = Router();

const SUPPORT_RECIPIENT = process.env.SUPPORT_INBOX || "support@trywireline.com";
const SUPPORT_RATE_WINDOW_MS = 15 * 60_000;
const SUPPORT_RATE_MAX = 5;

// TWO public forms post here with different category vocabularies.
// Both sets must stay accepted — dropping either silently 400s every
// submission from that page (the /contact set was missing in production,
// which broke the "Talk to Wireline" sales channel with
// "Pick a valid issue type." on every submit).
const ISSUE_TYPES = new Set([
  // /support — src/components/SupportPage.tsx
  "billing",
  "tech",
  "feature",
  "agent",
  "account",
  "other",
  // /contact — src/components/ContactPage.tsx
  "personal",
  "sales",
  "partnership",
  "general",
]);

/**
 * The support form creates real email-provider work, so unlike ordinary public
 * read paths it may not fall back to per-instance memory in production. The
 * explicit status preflight catches missing Redis configuration; the
 * failClosedOnError option catches an Upstash/network failure after that check.
 */
async function ticketRateLimiter(req: Request, res: Response, next: NextFunction) {
  const distributed = distributedLimiterStatus();
  if (!distributed.ok) {
    return res.status(503).json({
      error: "Support intake is temporarily unavailable. Email support@trywireline.com directly.",
      code: distributed.code || "RATE_LIMITER_UNAVAILABLE",
    });
  }

  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const result = await rateLimit(ip, {
      bucket: "public:support-ticket",
      windowMs: SUPPORT_RATE_WINDOW_MS,
      max: SUPPORT_RATE_MAX,
      failClosedOnError: true,
    });

    res.set("RateLimit-Limit", String(SUPPORT_RATE_MAX));
    res.set("RateLimit-Remaining", String(result.remaining));
    res.set("RateLimit-Reset", String(Math.ceil((Date.now() + result.resetMs) / 1000)));

    if (!result.allowed) {
      res.set("Retry-After", String(Math.ceil(result.resetMs / 1000)));
      return res.status(429).json({
        code: "SUPPORT_RATE_LIMITED",
        error: "Too many support requests. Try again in 15 minutes.",
      });
    }
    next();
  } catch (err) {
    log.error("Support ticket rate limiter failed closed", { error: getErrorMessage(err) });
    return res.status(503).json({
      error: "Support intake is temporarily unavailable. Email support@trywireline.com directly.",
      code: "RATE_LIMITER_ERROR",
    });
  }
}

router.post("/api/support/ticket", ticketRateLimiter, async (req: Request, res: Response) => {
  try {
    const { issueType, email, subject, body } = req.body ?? {};
    if (
      typeof issueType !== "string" ||
      typeof email !== "string" ||
      typeof subject !== "string" ||
      typeof body !== "string"
    ) {
      throw AppError.fromHttpStatus(400, "Valid support request required.");
    }

    const cleanIssueType = issueType.trim();
    const cleanEmail = normalizeEmail(email);
    const cleanSubject = subject.trim();
    const cleanBody = body.trim();

    // Tight server-side validation so direct POSTs cannot bypass either public
    // form's client validation or pad whitespace around minimum lengths.
    if (!ISSUE_TYPES.has(cleanIssueType)) {
      throw AppError.fromHttpStatus(400, "Pick a valid issue type.");
    }
    if (
      cleanEmail.length > 320 ||
      !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(cleanEmail)
    ) {
      throw AppError.fromHttpStatus(400, "Valid email required.");
    }
    if (cleanSubject.length < 3 || cleanSubject.length > 200) {
      throw AppError.fromHttpStatus(400, "Subject must be 3-200 chars.");
    }
    if (cleanBody.length < 10 || cleanBody.length > 5000) {
      throw AppError.fromHttpStatus(400, "Body must be 10-5000 chars.");
    }

    const ts = new Date().toISOString();
    const emailSubject = `[Wireline Support / ${cleanIssueType}] ${cleanSubject}`;
    const emailBody = [
      `Wireline support ticket — ${ts}`,
      ``,
      `From:        ${cleanEmail}`,
      `Issue type:  ${cleanIssueType}`,
      `Subject:     ${cleanSubject}`,
      `IP:          ${req.ip}`,
      ``,
      `─── Body ─────────────────────────────────────────`,
      cleanBody,
    ].join("\n");

    const result = await sendSupportEmail({
      to: SUPPORT_RECIPIENT,
      replyTo: cleanEmail,
      subject: emailSubject,
      text: emailBody,
    });
    if (!result.ok) {
      log.warn("Support ticket email send failed", { error: result.error });
      return res.status(503).json({
        ok: false,
        sent: false,
        // Same value normalize-api-error-response would backfill for a 503;
        // stating it inline keeps the api-error ratchet at zero legacy shapes.
        code: "SERVICE_UNAVAILABLE",
        error:
          "Couldn't deliver your message just now. Email support@trywireline.com or try again.",
      });
    }

    log.info("Support ticket received", { issueType: cleanIssueType, sent: true });
    return res.json({ ok: true, sent: true });
  } catch (e) {
    if (e instanceof AppError) throw e;
    log.error("Support ticket route failed", { error: getErrorMessage(e) });
    return res
      .status(500)
      .json({ error: "Couldn't submit ticket — please email support@trywireline.com directly." });
  }
});

export default router;
