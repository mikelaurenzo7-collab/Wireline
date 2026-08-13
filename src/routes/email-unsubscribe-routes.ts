import { AppError } from "../lib/api-error";
/**
 * Public email unsubscribe endpoints (CAN-SPAM + RFC 8058 one-click).
 *
 * Wireline product/billing marketing uses a global recipient suppression.
 * Tenant campaign marketing uses a (tenant, recipient) suppression so an
 * opt-out from one business never silences an unrelated business.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { rateLimit } from "../lib/rate-limit";
import {
  verifyUnsubscribeToken,
  recordEmailSuppression,
  verifyTenantUnsubscribeToken,
  recordTenantEmailSuppression,
} from "../lib/email-compliance";

const router = Router();

type UnsubscribeTarget =
  { scope: "wireline"; email: string } | { scope: "tenant"; userId: string; email: string };

function targetFromToken(token: string): UnsubscribeTarget | null {
  const tenant = verifyTenantUnsubscribeToken(token);
  if (tenant) return { scope: "tenant", ...tenant };
  const email = verifyUnsubscribeToken(token);
  return email ? { scope: "wireline", email } : null;
}

async function recordTarget(
  target: UnsubscribeTarget,
  reason: "one_click_unsubscribe" | "link_unsubscribe",
): Promise<boolean> {
  return target.scope === "tenant"
    ? recordTenantEmailSuppression(target.userId, target.email, reason)
    : recordEmailSuppression(target.email, reason);
}

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
    const target = targetFromToken(String(req.query.token || ""));
    if (!target) {
      log.warn("Invalid or missing unsubscribe token on POST");
      res.status(200).json({ ok: true, unsubscribed: false });
      return;
    }
    const recorded = await recordTarget(target, "one_click_unsubscribe");
    if (!recorded) {
      res.setHeader("Retry-After", "300");
      res.status(503).json({ ok: false, unsubscribed: false });
      return;
    }
    // Never put the recipient or signed token in logs.
    log.info("Email one-click unsubscribe recorded", { scope: target.scope });
    res.status(200).json({ ok: true, unsubscribed: true });
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("POST /api/email/unsubscribe failed", { error: getErrorMessage(err) });
    res.setHeader("Retry-After", "300");
    res.status(503).json({ ok: false, unsubscribed: false });
  }
});

router.get("/api/email/unsubscribe", unsubscribeRateLimit, async (req: Request, res: Response) => {
  const rawToken = String(req.query.token || "");
  const target = targetFromToken(rawToken);
  if (!target) {
    res
      .status(400)
      .type("html")
      .send(renderPage("Invalid unsubscribe link", "This unsubscribe link is invalid or expired."));
    return;
  }

  // A bare GET must NOT mutate. Enterprise mail security (Defender Safe Links,
  // Proofpoint URL Defense, Barracuda) pre-fetches every URL in a message
  // body, so recording the suppression on GET opts recipients out who never
  // clicked. Require an explicit confirm click — which link scanners do not
  // perform — before suppressing. RFC 8058 one-click stays on the POST route.
  if (String(req.query.confirm || "") !== "1") {
    const confirmHref = `/api/email/unsubscribe?token=${encodeURIComponent(rawToken)}&confirm=1`;
    const intro =
      target.scope === "tenant"
        ? `Confirm that <strong>${escapeHtml(target.email)}</strong> should stop receiving marketing email from this sender.`
        : `Confirm that <strong>${escapeHtml(target.email)}</strong> should stop receiving Wireline product &amp; billing reminders. You'll still get essential account email (security and billing receipts).`;
    res
      .status(200)
      .type("html")
      .send(
        renderPage(
          "Confirm unsubscribe",
          `${intro}<div style="margin-top:24px;"><a href="${confirmHref}" style="display:inline-block;background:#4F1E7B;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px;">Confirm unsubscribe</a></div>`,
        ),
      );
    return;
  }

  const recorded = await recordTarget(target, "link_unsubscribe");
  if (!recorded) {
    log.error("GET /api/email/unsubscribe failed to record suppression", { scope: target.scope });
    res
      .status(503)
      .type("html")
      .send(
        renderPage(
          "We couldn't process that just now",
          `Your unsubscribe request for <strong>${escapeHtml(target.email)}</strong> didn't go through. ` +
            `Please refresh this page in a few minutes to try again, or email support@trywireline.com and we'll remove you manually.`,
        ),
      );
    return;
  }

  log.info("Email unsubscribe link recorded", { scope: target.scope });
  const body =
    target.scope === "tenant"
      ? `<strong>${escapeHtml(target.email)}</strong> will no longer receive marketing email from this sender.`
      : `<strong>${escapeHtml(target.email)}</strong> will no longer receive Wireline product &amp; billing reminders. You'll still get essential account email (security and billing receipts).`;
  res.status(200).type("html").send(renderPage("You're unsubscribed", body));
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
