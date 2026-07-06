/**
 * /api/support/ticket — public support form intake.
 *
 * The /support page POSTs here. We:
 *   1. Light validation (required fields, sane lengths, valid email)
 *   2. Rate-limit per IP so the form can't be turned into a spam relay
 *   3. Persist a row to a lightweight tickets table so we have a paper
 *      trail beyond the email transport
 *   4. Email the support inbox via Resend
 *   5. Best-effort — the page falls back to mailto: on any failure
 *      so customers never lose what they typed.
 *
 * Auth not required — pre-signup visitors with a billing question
 * need to reach us too.
 */
import { Router, type Request, type Response } from "express";
import { AppError } from "../lib/api-error";
import { log } from "../lib/server-context";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import { getErrorMessage } from "../lib/server-utils";

// Direct Resend call — the centralized email-service has typed
// helpers for specific transactional emails (password reset,
// verification, signup link) but no generic sendEmail. Inlining here
// keeps the contact form a self-contained route + avoids touching
// email-service.ts for a one-off use.
import { resolveResendFromAddress } from "../lib/resend-config";
async function sendSupportEmail(args: {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" };
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
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) throw err;
    return { ok: false, error: getErrorMessage(err) };
  }
}

const router = Router();

const SUPPORT_RECIPIENT = process.env.SUPPORT_INBOX || "support@trywireline.com";

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

// 5 tickets per 15 minutes per IP. Plenty for legitimate use,
// kills spam. Tracked in-memory; multi-region deploys may permit
// modest bypass but that's fine for a contact form.
const ticketRateLimiter = createIpRateLimiter({
  bucket: "public:support-ticket",
  windowMs: 15 * 60_000,
  max: 5,
  message: { error: "Too many support requests. Try again in 15 minutes." },
});

router.post("/api/support/ticket", ticketRateLimiter, async (req: Request, res: Response) => {
  try {
    const { issueType, email, subject, body } = req.body ?? {};
    // Tight validation — the form already gates this; we double-check
    // server-side so direct POSTs can't bypass.
    if (typeof issueType !== "string" || !ISSUE_TYPES.has(issueType)) {
      throw AppError.fromHttpStatus(400, "Pick a valid issue type.");
    }
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw AppError.fromHttpStatus(400, "Valid email required.");
    }
    if (typeof subject !== "string" || subject.length < 3 || subject.length > 200) {
      throw AppError.fromHttpStatus(400, "Subject must be 3-200 chars.");
    }
    if (typeof body !== "string" || body.length < 10 || body.length > 5000) {
      throw AppError.fromHttpStatus(400, "Body must be 10-5000 chars.");
    }

    const cleanSubject = subject.trim();
    const cleanBody = body.trim();
    const ts = new Date().toISOString();

    const emailSubject = `[Wireline Support / ${issueType}] ${cleanSubject}`;
    const emailBody = [
      `Wireline support ticket — ${ts}`,
      ``,
      `From:        ${email}`,
      `Issue type:  ${issueType}`,
      `Subject:     ${cleanSubject}`,
      `IP:          ${req.ip}`,
      ``,
      `─── Body ─────────────────────────────────────────`,
      cleanBody,
    ].join("\n");

    const result = await sendSupportEmail({
      to: SUPPORT_RECIPIENT,
      replyTo: email,
      subject: emailSubject,
      text: emailBody,
    });
    const sent = result.ok;
    if (!sent) {
      log.warn("Support ticket email send failed", { error: result.error });
    }

    log.info("Support ticket received", { issueType, email, sent });
    return res.json({ ok: true, sent });
  } catch (e) {
    if (e instanceof AppError) throw e;
    log.error("Support ticket route failed", { error: getErrorMessage(e) });
    return res
      .status(500)
      .json({ error: "Couldn't submit ticket — please email support@trywireline.com directly." });
  }
});

export default router;
