import { AppError } from "../lib/api-error";
/**
 * Public email unsubscribe endpoints (CAN-SPAM + RFC 8058 one-click).
 *
 * Kept separate from the authenticated Account Holder inbox routes in
 * email-routes.ts: these are PUBLIC by design — no auth. The signed token IS
 * the credential (it encodes the recipient address and is HMAC-verified), so
 * only someone who received the email can unsubscribe it. Two entry points:
 *
 *   POST /api/email/unsubscribe?token=…   ← mailbox-provider one-click button
 *   GET  /api/email/unsubscribe?token=…   ← the human link in the footer
 *
 * The POST must return 2xx promptly (Gmail/Yahoo penalize senders whose
 * one-click endpoint errors), so the IP limiter is generous and the handler
 * never surfaces a hard failure to providers.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { rateLimit } from "../lib/rate-limit";
import { verifyUnsubscribeToken, recordEmailSuppression } from "../lib/email-compliance";

const router = Router();

// Generous IP-keyed limiter: high enough that a mailbox provider batching
// one-click POSTs is never blocked, low enough to bound abuse. Fails OPEN.
async function unsubscribeRateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = req.ip || "anon";
    const result = await rateLimit(`email-unsub:${ip}`, {
      bucket: "email:unsubscribe",
      windowMs: 60_000,
      max: 120,
    });
    if (!result.allowed) {
      res.setHeader("Retry-After", String(Math.ceil(result.resetMs / 1000)));
      throw AppError.fromHttpStatus(429, "Too many requests");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.warn("unsubscribe rate limiter error — fail open", { error: getErrorMessage(err) });
  }
  next();
}

router.post("/api/email/unsubscribe", unsubscribeRateLimit, async (req: Request, res: Response) => {
  try {
    const email = verifyUnsubscribeToken(String(req.query.token || ""));
    if (!email) {
      log.warn("Invalid or missing unsubscribe token on POST");
      res.status(200).json({ ok: true, unsubscribed: false });
      return;
    }
    await recordEmailSuppression(email, "one_click_unsubscribe");
    log.info("Email one-click unsubscribe recorded", { email });
    res.status(200).json({ ok: true, unsubscribed: true });
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Never make a mailbox provider hammer-retry a one-click POST.
    log.error("POST /api/email/unsubscribe failed", { error: getErrorMessage(err) });
    res.status(200).json({ ok: true });
  }
});

router.get("/api/email/unsubscribe", unsubscribeRateLimit, async (req: Request, res: Response) => {
  const email = verifyUnsubscribeToken(String(req.query.token || ""));
  if (!email) {
    res
      .status(400)
      .type("html")
      .send(renderPage("Invalid unsubscribe link", "This unsubscribe link is invalid or expired."));
    return;
  }
  try {
    await recordEmailSuppression(email, "link_unsubscribe");
    log.info("Email unsubscribe (link) recorded", { email });
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("GET /api/email/unsubscribe failed", { error: getErrorMessage(err) });
  }
  res
    .status(200)
    .type("html")
    .send(
      renderPage(
        "You're unsubscribed",
        `<strong>${escapeHtml(email)}</strong> will no longer receive Wireline product &amp; billing reminders. ` +
          `You'll still get essential account email (security and billing receipts).`,
      ),
    );
});

function renderPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)} · Wireline</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f6f5fa;color:#1A1A23;">
  <div style="max-width:480px;margin:80px auto;padding:32px;background:#fff;border-radius:16px;border:1px solid rgba(79,30,123,0.08);">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;">${escapeHtml(title)}</h1>
    <p style="margin:0;line-height:1.6;color:#2A2A33;font-size:14px;">${body}</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default router;
